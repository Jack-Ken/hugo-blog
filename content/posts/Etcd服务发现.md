---
title: "Etcd服务发现与注册、自定义负载均衡"
date: 2023-11-05
draft: false
tags: []
categories: ["Go学习"]
summary: "Etcd服务发现与注册、自定义负载均衡1、什么是服务发现与注册服务注册和发现的基本原理如下： 服务注册 指服务实例启动的时候将自身的信息注册到服务注册与发现中心，并在运行的时候通过心跳的方式向服务注册..."
---

## 1、什么是服务发现与注册

服务注册和发现的基本原理如下：![服务注册和发现](https://pic4.zhimg.com/80/v2-ef494d4338d0bee2719095ed997cc79f_1440w.webp)

**服务注册**

指服务实例启动的时候将自身的信息注册到服务注册与发现中心，并在运行的时候通过心跳的方式向服务注册发现中心汇报自身服务状态

**服务发现**

指服务实例向服务注册与发现中心获取的其他服务实例信息，用于进行后续的远程调用。

## 2、服务注册和发现的作用

1、管理实例信息

管理当前注册到服务注册与发现中心的微服务实例元数据信息，这些信息包括服务实例的服务名，IP地址，端口号，服务状态和服务描述等等信息

2、健康检查

服务注册与发现中心会与已经注册 ok 的微服务实例维持心跳，定期检查注册表中的服务是否正常在线，并且会在过程中剔除掉无效的服务实例信息

3、提供服务发现的作用

服务发现是指在分布式系统中自动发现和识别服务实例的过程。在一个典型的分布式应用中，服务通常被拆分成多个小的、可伸缩的服务实例，这些实例可能被部署在不同的物理机器或容器中。服务发现可以帮助应用程序识别它所依赖的服务实例的位置和状态，并在需要的时候自动连接到这些服务。

服务发现通常包括两个主要组件：服务注册和服务发现。服务注册是指服务实例向服务注册中心注册自己的信息，包括服务名称、IP地址、端口号、协议类型等。服务注册中心将这些信息存储下来，供其他服务或客户端查询。服务发现是指服务实例或客户端查询服务注册中心，以获取服务实例的信息。查询可以按服务名称、标签等方式进行，服务发现返回匹配的服务实例列表，客户端根据这些信息与服务实例建立连接。

如一个服务需要调用服务注册与发现中心中的微服务实例，可以通过**服务注册与发现中心**获取到其具体的服务实例信息

## 3、ETCD

ETCD 一个开源的、高可用的分布式key-value存储系统，可以用于配置共享和服务的注册和发现，它专注于：

- 简单：定义清晰、面向用户的API（gRPC）
- 安全：可选的客户端TLS证书自动认证
- 快速：支持每秒10,000次写入
- 可靠：基于Raft算法确保强一致性

##### etcd与redis差异

etcd和redis都支持键值存储，也支持分布式特性，redis支持的数据格式更加丰富，但是他们两个定位和应用场景不一样，关键差异如下：

- redis在分布式环境下不是强一致性的，可能会丢失数据，或者读取不到最新数据
- redis的数据变化监听机制没有etcd完善
- etcd强一致性保证数据可靠性，导致性能上要低于redis
- etcd和ZooKeeper是定位类似的项目，跟redis定位不一样

##### 为什么用 etcd 而不用ZooKeeper？

相较之下，ZooKeeper有如下缺点：

- `复杂`：ZooKeeper的部署维护复杂，管理员需要掌握一系列的知识和技能；而 Paxos 强一致性算法也是素来以复杂难懂而闻名于世；另外，ZooKeeper的使用也比较复杂，需要安装客户端，官方只提供了 Java 和 C 两种语言的接口。
- `难以维护`：Java 编写。这里不是对 Java 有偏见，而是 Java 本身就偏向于重型应用，它会引入大量的依赖。而运维人员则普遍希望保持强一致、高可用的机器集群尽可能简单，维护起来也不易出错。
- `发展缓慢`：Apache 基金会项目特有的“Apache Way”在开源界饱受争议，其中一大原因就是由于基金会庞大的结构以及松散的管理导致项目发展缓慢。

**使用etcd进行服务注册与健康检查**

根据etcd的`v3 API`，当启动一个服务时候，我们把服务的地址写进etcd，注册服务。同时绑定租约（lease），并以续租约（keep leases alive）的方式检测服务是否正常运行，从而实现健康检查。

我们先定义服务包，用于描述服务信息、定义工具函数-根据服务信息生成前缀等。

```go
package etcd

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"google.golang.org/grpc/resolver"
)

type Server struct {
	Name    string `json:"name"`
	Addr    string `json:"addr"`    //服务地址
	Version string `json:"version"` //服务版本
	Weight  int64  `json:"weight"`  //服务权重
}

func BuildPrefix(info *Server) string {
	if info.Version == "" {
		return fmt.Sprintf("/%s/", info.Name)
	}
	return fmt.Sprintf("/%s/%s/", info.Name, info.Addr)
}

func BuildRegPath(info *Server) string {
	return fmt.Sprintf("%s%s", BuildPrefix(info), info.Addr)
}

func ParseValue(value []byte) (*Server, error) {
	info := &Server{}
	if err := json.Unmarshal(value, &info); err != nil {
		return info, err
	}
	return info, nil
}

func SplitPath(path string) (*Server, error) {
	info := &Server{}
	strs := strings.Split(path, "/")
	if len(strs) == 0 {
		return info, errors.New("invalid path")
	}
	info.Addr = strs[len(strs)-1]
	return info, nil
}

// Exist helper function
func Exist(l []resolver.Address, addr resolver.Address) bool {
	for i := range l {
		if l[i].Addr == addr.Addr {
			return true
		}
	}
	return false
}

// Remove helper function
func Remove(s []resolver.Address, addr resolver.Address) ([]resolver.Address, bool) {
	for i := range s {
		if s[i].Addr == addr.Addr {
			s[i] = s[len(s)-1]
			return s[:len(s)-1], true
		}
	}
	return nil, false
}

func BuildResolverUrl(app string) string {
	return schema + ":///" + app
}
```

服务端的主要步骤如下：

- 创建gprc服务端
- 将grpc服务端的ip和port等信息作为value，服务名（自己取，如：/ns/cloud-service-1）作为key，put到etcd中

由于服务端无法保证自身是一直可用的，可能会宕机，所以etcd的租约是有时间限制的，租约一旦过期，服务端存储在etcd上的服务信息就会消失。

另一方面，如果服务端是正常运行的，etcd中的地址信息又必须存在，因此发送心跳检测，一旦发现etcd上没有自己的服务地址时，请求重新添加（续租）。

```go
package etcd

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
	"go.uber.org/zap"
)

// Register for grpc server
type Register struct {
	EtcdAddrs   []string
	DialTimeout int

	ctx    context.Context
	cancel context.CancelFunc

	leasesID    clientv3.LeaseID
	keepAliveCh <-chan *clientv3.LeaseKeepAliveResponse

	srvInfo *Server
	srvTTL  int64
	cli     *clientv3.Client
	logger  *zap.Logger
}

// NewRegister create a register base on etcd
func NewRegister(etcdAddrs []string, looger *zap.Logger) *Register {
	return &Register{
		EtcdAddrs:   etcdAddrs,
		DialTimeout: 3,
		logger:      looger,
	}
}

// Register a service
func (r *Register) Register(srvInfo *Server, ttl int64) (context.CancelFunc, error) {
	var err error

	if strings.Split(srvInfo.Addr, ":")[0] == "" {
		return nil, errors.New("invalid ip")
	}

	if r.cli, err = clientv3.New(clientv3.Config{
		Endpoints:   r.EtcdAddrs,
		DialTimeout: time.Duration(r.DialTimeout) * time.Second,
	}); err != nil {
		return nil, err
	}

	r.srvInfo = srvInfo
	r.srvTTL = ttl

	if err = r.register(); err != nil {
		return nil, err
	}

	go r.KeepAlive()

	return r.cancel, nil

}

func (r *Register) register() error {
	leaseCtx, cancel := context.WithCancel(context.Background())
	//leaseCtx, cancel := context.WithTimeout(context.Background(), time.Duration(r.DialTimeout)*time.Second)
	r.ctx = leaseCtx
	r.cancel = cancel

	leaseResp, err := r.cli.Grant(leaseCtx, r.srvTTL)
	if err != nil {
		return err
	}

	r.leasesID = leaseResp.ID
	if r.keepAliveCh, err = r.cli.KeepAlive(r.ctx, leaseResp.ID); err != nil {
		return err
	}

	data, err := json.Marshal(r.srvInfo)
	if err != nil {
		return err
	}
	_, err = r.cli.Put(r.ctx, BuildRegPath(r.srvInfo), string(data), clientv3.WithLease(r.leasesID))
	return err
}

func (r *Register) unregister() error {
	_, err := r.cli.Delete(r.ctx, BuildRegPath(r.srvInfo))
	return err
}

func (r *Register) KeepAlive() {
	ticker := time.NewTicker(time.Duration(r.srvTTL) * time.Second)

	for {
		select {
		case <-r.ctx.Done():
			if err := r.unregister(); err != nil {
				r.logger.Error("unregister failed", zap.Error(err))
			}
			if _, err := r.cli.Revoke(r.ctx, r.leasesID); err != nil {
				r.logger.Error("revoke failed", zap.Error(err))
			}
			return
		case res := <-r.keepAliveCh:
			// 发现etcd上没有自己的服务地址,请求重新添加（续租）
			if res == nil {
				if err := r.register(); err != nil {
					r.logger.Error("register failed", zap.Error(err))
				}
			}
		case <-ticker.C:
			if r.keepAliveCh == nil {
				if err := r.register(); err != nil {
					r.logger.Error("register failed", zap.Error(err))
				}
			}
		}

	}
}

// UpdateHandler return http handler
func (r *Register) UpdateHandler() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		wi := req.URL.Query().Get("weight")
		weight, err := strconv.Atoi(wi)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			w.Write([]byte(err.Error()))
			return
		}

		var update = func() error {
			r.srvInfo.Weight = int64(weight)
			data, err := json.Marshal(r.srvInfo)
			if err != nil {
				return err
			}
			_, err = r.cli.Put(r.ctx, BuildRegPath(r.srvInfo), string(data), clientv3.WithLease(r.leasesID))
			return err
		}

		if err := update(); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(err.Error()))
			return
		}
		w.Write([]byte("update server weight success"))
	})
}

func (r *Register) GetServerInfo() (*Server, error) {
	resp, err := r.cli.Get(r.ctx, BuildRegPath(r.srvInfo))
	if err != nil {
		return r.srvInfo, err
	}
	info := &Server{}
	if resp.Count >= 1 {
		if err := json.Unmarshal(resp.Kvs[0].Value, &info); err != nil {
			return info, err
		}
	}
	return info, nil
}

func (r *Register) Close() {
	r.cancel()
}
```

我们封装好注册服务器之后，我们需要在启动grpc服务时调用，下面的代码就是将一个grpc服务注册到etcd中。

```go
package main

import (
	"mini_tiktok/etcd"
	"mini_tiktok/internal/initialize"
	"mini_tiktok/internal/rpc/client"
	authService "mini_tiktok/internal/rpc/rpcGen/auth"
	"net"

	"google.golang.org/grpc"

	"go.uber.org/zap"
)

const Network = "tcp"

func main() {
	serverInfo := &etcd.Server{
		Name:    "user-service-1",
		Addr:    "127.0.0.1:8889",
		Version: "v1",
		Weight:  6,
	}

	listener, err := net.Listen(Network, serverInfo.Addr)

	if err != nil {
		initialize.Log.Fatal("net.Listen err: %v", zap.Error(err))
	}

	// 创建注册器
	etcdRegister := etcd.NewRegister(initialize.Conf.EtcdConfig.Addrs, initialize.Log)
	defer etcdRegister.Close()

    // 注册服务
	_, err = etcdRegister.Register(serverInfo, 3)
	if err != nil {
		initialize.Log.Fatal("register Server to etcd failed: %v", zap.Error(err))
	}

	// 新建gRPC服务器实例
	grpcServer := grpc.NewServer()
	// 在gRPC服务器注册我们的服务
	authService.RegisterAuthServiceServer(grpcServer, &client.AuthService{})

	//用服务器 Serve() 方法以及我们的端口信息区实现阻塞等待，直到进程被杀死或者 Stop() 被调用
	err = grpcServer.Serve(listener)
	if err != nil {
		initialize.Log.Fatal("grpcServer.Serve err: %v", zap.Error(err))
	}
}
```

**使用etcd实现服务发现**

首先我们先来了解一下Name Resolution流程

gRPC resolver 包定义了两个接口  Resolver和 Bulider。我们需要自定义代码实现两个接口。其中Resolver的实现是整个功能最核心的代码，需要将服务名解析为对应的实例。而后者的实现者需要创建并注册一个Bulider实例。这样，当客户端在调用Dial方法对指定的服务拨号时，grpc resolver查找注册的Builder实例调用其build()方法构建自定义的Resolver实例。其中Build()方法的作用就是创建一个Resolver实例。

![Resolver流程](https://imgconvert.csdnimg.cn/aHR0cHM6Ly9tbWJpei5xcGljLmNuL21tYml6X3BuZy81V1hFdUdZWklpYkNkTGdoczF5NzVUaWFsTm9odjFUOFQ1aWEwQ1NuaWJBaWF6S2huMXJlT2RhUWljNUdFQXN5VmtrcEFta05wUnZZQ3NWSHU3TFkxS3RTMjhXdy82NDA?x-oss-process=image/format,png)

下面是gprc Resolver的整个详细流程

- 客户端启动时，引入自定义的 resolver 包（比如本例中我们自定义的 ns 包）

  - 引入 ns 包，在 init() 阶段，构造自定义的 resolveBuilder，并将其注册到 grpc 内部的 resolveBuilder 表中（其实是一个全局 map，key 为协议名，比如 ns；value 为构造的 resolveBuilder，比如 nsResolverBuilder）。
- 客户端启动时通过自定义 Dail() 方法构造 grpc.ClientConn 单例

  - grpc.DialContext() 方法内部解析 URI，分析协议类型，并从 resolveBuilder 表中查找协议对应的 resolverBuilder。比如本例中我们定义的 URI 协议类型为 ns，对应的 resolverBuilder 为 nsResolverBuilder
- 找到指定的 resolveBuilder 后，调用 resolveBuilder 的 Build() 方法，构建自定义 resolver，同时开启协程，通过此 resolver 更新被调服务实例列表。
- Dial() 方法接收主调服务名和被调服务名，并根据自定义的协议名，基于这两个参数构造服务的 URI
- Dial() 方法内部使用构造的 URI，调用 grpc.DialContext() 方法对指定服务进行拨号
- grpc 底层 LB 库对每个实例均创建一个 subConnection，最终根据相应的 LB 策略，选择合适的 subConnection 处理某次 RPC 请求。

grpc客户端为我们提供了实现服务发现和负载均衡的钩子，下面是实现服务发现的源码。

```go
package etcd

import (
	"context"
	"time"

	"go.etcd.io/etcd/api/v3/mvccpb"
	clientv3 "go.etcd.io/etcd/client/v3"
	"go.uber.org/zap"
	"google.golang.org/grpc/resolver"
)

const (
	schema = "etcd"
)

// Resolver for grpc client
type Resolver struct {
	schema      string
	EtcdAddrs   []string
	DialTimeout int

	ctx    context.Context
	cancel context.CancelFunc

	watchCh      clientv3.WatchChan
	cli          *clientv3.Client
	keyPrifix    string
	srvAddrsList []resolver.Address

	cc     resolver.ClientConn
	logger *zap.Logger
}

// NewResolver create a new resolver.Builder base on etcd
func NewResolver(etcdAddrs []string, logger *zap.Logger) *Resolver {
	return &Resolver{
		schema:      schema,
		EtcdAddrs:   etcdAddrs,
		DialTimeout: 3,
		logger:      logger,
	}
}

// Scheme returns the scheme supported by this resolver.
func (r *Resolver) Scheme() string {
	return r.schema
}

// Build creates a new resolver.Resolver for the given target
func (r *Resolver) Build(target resolver.Target, cc resolver.ClientConn, opts resolver.BuildOptions) (resolver.Resolver, error) {
	r.cc = cc

	r.keyPrifix = BuildPrefix(&Server{Name: target.Endpoint, Version: target.Authority})
	if _, err := r.start(); err != nil {
		return nil, err
	}
	return r, nil
}

// ResolveNow resolver.Resolver interface
func (r *Resolver) ResolveNow(o resolver.ResolveNowOptions) {}

// Close resolver.Resolver interface
func (r *Resolver) Close() {
	r.cancel()
}

// start
func (r *Resolver) start() (context.CancelFunc, error) {
	var err error
	r.cli, err = clientv3.New(clientv3.Config{
		Endpoints:   r.EtcdAddrs,
		DialTimeout: time.Duration(r.DialTimeout) * time.Second,
	})
	if err != nil {
		return nil, err
	}
	resolver.Register(r)

	r.ctx, r.cancel = context.WithCancel(context.Background())

	if err = r.sync(); err != nil {
		return nil, err
	}

	go r.watch()

	return r.cancel, nil
}

// watch update events
func (r *Resolver) watch() {
	ticker := time.NewTicker(time.Minute)
	r.watchCh = r.cli.Watch(r.ctx, r.keyPrifix, clientv3.WithPrefix())

	for {
		select {
		case <-r.ctx.Done():
			return
		case res, ok := <-r.watchCh:
			if ok {
				r.update(res.Events)
			}
		case <-ticker.C:
			if err := r.sync(); err != nil {
				r.logger.Error("sync failed", zap.Error(err))
			}
		}
	}
}

// update
func (r *Resolver) update(events []*clientv3.Event) {
	for _, ev := range events {
		var info *Server
		var err error

		switch ev.Type {
		case mvccpb.PUT:
			info, err = ParseValue(ev.Kv.Value)
			if err != nil {
				continue
			}
			addr := resolver.Address{Addr: info.Addr, Metadata: info.Weight}
			if !Exist(r.srvAddrsList, addr) {
				r.srvAddrsList = append(r.srvAddrsList, addr)
				r.cc.UpdateState(resolver.State{Addresses: r.srvAddrsList})
			}
		case mvccpb.DELETE:
			info, err = SplitPath(string(ev.Kv.Key))
			if err != nil {
				continue
			}
			addr := resolver.Address{Addr: info.Addr}
			if s, ok := Remove(r.srvAddrsList, addr); ok {
				r.srvAddrsList = s
				r.cc.UpdateState(resolver.State{Addresses: r.srvAddrsList})
			}
		}
	}
}

// sync 同步获取所有地址信息
func (r *Resolver) sync() error {
	ctx, cancel := context.WithTimeout(r.ctx, 3*time.Second)
	defer cancel()
	res, err := r.cli.Get(ctx, r.keyPrifix, clientv3.WithPrefix())
	if err != nil {
		return err
	}
	r.srvAddrsList = []resolver.Address{}

	for _, v := range res.Kvs {
		info, err := ParseValue(v.Value)
		if err != nil {
			continue
		}
		addr := resolver.Address{Addr: info.Addr, Metadata: info.Weight}
		r.srvAddrsList = append(r.srvAddrsList, addr)
	}
	r.cc.UpdateState(resolver.State{Addresses: r.srvAddrsList})
	return nil
}
```

客户端使用服务注册的代码如下

```go
var FeedClient feedService.FeedServiceClient

//const feed_address = "127.0.0.1:8890"

func init() {
	// 注册自定义的ETCD解析器
	etcdResolverBuilder := etcd.NewResolver([]string{"127.0.0.1:2379"}, initialize.Log)
	resolver.Register(etcdResolverBuilder)

	// 连接服务器
	conn, err := grpc.Dial(etcdResolverBuilder.Scheme()+":///feed-service-1", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("net.Connect err: %v", err)
	}
	defer conn.Close()

	// 建立gRPC连接
	FeedClient = feedService.NewFeedServiceClient(conn)

    // client调用服务
    // ......
}
```

## 4、负载均衡

为了提高系统的负载能力和稳定性，我们的服务端往往具有多台服务器，负载均衡的目的就是希望请求能分散到不同的服务器，从服务器列表中选择一台服务器的算法就是负载均衡的策略，常见的轮循、加权轮询等

负载均衡器要在多台服务器之间选择，所以通常情况下负载均衡器是具备服务发现的能力的

### 实现方式

根据负载均衡实现所在的位置不同，通常可分为以下三种解决方案：

**1、集中式负载均衡（Proxy Model）**

在客户端和服务端之间有一个独立的LB，通常是专门的硬件设备如 F5，或者基于软件如 LVS，HAproxy，Nginx等实现。LB使用负载均衡策略将请求转发到目标服务

这种做法的缺点也很明显，所有的服务调用流量都会经过LB，当服务数量和调用量大的时候，LB就会成为瓶颈。一旦LB故障就会影响整个系统。而且在服务端和客户端之间增加一级，有一定的性能开销。

![集中式负载均衡](/pic/16.png)

**2、客户端负载均衡（Balancing-aware Client）**

将LB的功能集中到客户端进程中，然后使用负载均衡策略选择一个目标服务地址，向目标发起请求。LB能力被分散到每一个服务消费者的进程内部，同时服务消费方和服务提供方之间是直接调用，没有额外的开销，性泵较好。

缺点，但是如果有多种不同的语言栈，就要配合开发不同的客户端，有一定的研发和维护成本；后续如果要对客户库进行升级，势必要求服务调用方修改代码并重新发布，实际比较麻烦。

![客户端负载均衡](/pic/17.png)

**3、独立负载均衡进程（External Load Balancing Service）**

将LB从进程内移出来，变成主机上的一个独立进程。主机上的一个或者多个服务要访问目标服务时，他们都通过同一主机上的独立LB进程做负载均衡

此方案有两种模式

第一种是直接由LB进行转发请求，被称为sidecar方案

第二种是从LB获取到IP后依旧由客户端发起请求，gRPC曾经支持过此方案叫lookaside方案，目前已废弃

该方案也是一种分布式方案没有单点问题，一个LB进程挂了只影响该主机上的客户端；客户端和LB之间是本地调用调用性能好；同时该方案还简化了客户端，不需要为不同语言开发客户库，LB的升级不需要服务调用方改代码。该方案主要问题：部署较复杂，环节多，出错调试排查问题不方便

![独立负载均衡进程](/pic/18.png)

### gRPC的负载均衡

gRPC中的负载平衡是以每次调用为基础，而不是以每个连接为基础。换句话说，即使所有的请求都来自一个客户端，它仍能在所有的服务器上实现负载平衡

**gRPC目前内置四种策略**

pick_first：默认策略，选择第一个

round_robin：轮询

使用默认的负载均衡器很简单，只需要在建立连接的时候指定负载均衡策略即可。

**但是要注意**：旧版本gRPC使用 `grpc.WithBalancerName("round_robin")`,已经被废弃，需要使用`grpc.WithDefaultServiceConfig`。`grpc.WithDefaultServiceConfig`可以被上文服务发现中提到的cc.UpdateState(State) error覆盖配置

```go
conn, err := grpc.Dial("example:cluster@callee",
  grpc.WithInsecure(),
  grpc.WithDefaultServiceConfig(
   `{"loadBalancingPolicy":"round_robin"}`,
  ),
 )
```

grpclb：已废弃不做介绍

xDS

xDS 在服务端实现服务发现，配置负载均衡策略等。支持xDS的客户端连接到xDS 服务端并通过xDS api来获取各种需要的数据和配置。

![servicemesh的负载均衡](/pic/19.png)

### 自定义负载均衡器

自定义负载均衡器需要使用google.golang.org/grpc/balancer.Register提前注册，此函数和服务发现一样接受工厂函数

```go
// Builder creates a balancer.
type Builder interface {
 // Build creates a new balancer with the ClientConn.
 Build(cc ClientConn, opts BuildOptions) Balancer
 // Name returns the name of balancers built by this builder.
 // It will be used to pick balancers (for example in service config).
 Name() string
}
```

`Name()`是负载均衡策略的名字

`Build(...)`需要返回负载均衡器

`cc ClientConn`代表客户端与服务端的连接，其拥有一系列函数可以让我们更新链接的状态

```go
type Balancer interface {
 // UpdateClientConnState is called by gRPC when the state of the ClientConn
 // changes.  If the error returned is ErrBadResolverState, the ClientConn
 // will begin calling ResolveNow on the active name resolver with
 // exponential backoff until a subsequent call to UpdateClientConnState
 // returns a nil error.  Any other errors are currently ignored.
 UpdateClientConnState(ClientConnState) error
 // ResolverError is called by gRPC when the name resolver reports an error.
 ResolverError(error)
 // UpdateSubConnState is called by gRPC when the state of a SubConn
 // changes.
 UpdateSubConnState(SubConn, SubConnState)
 // Close closes the balancer. The balancer is not required to call
 // ClientConn.RemoveSubConn for its existing SubConns.
 Close()
}
```

**类RR算法负载均衡器**

我们查看round_robin负载均衡的源码的具体实现，

![image-20230801223826630](/pic/12.png)

roundrobin.go主要实现逻辑总结：

- **1. 定义一个负载均衡名称**

> const Name = “round_robin”

- **2. 定义一个rrPickerBuilder，它只有一个方法：**

> func (*rrPickerBuilder) Build(info base.PickerBuildInfo) balancer.Picker{…}

rrPickerBuilder实际上是**PikcerBuilder接口的实现：**

**下面代码是PickerBuilder 接口**

```go
// PickerBuilder creates balancer.Picker.
type PickerBuilder interface {
	// Build returns a picker that will be used by gRPC to pick a SubConn.
	Build(info PickerBuildInfo) balancer.Picker
}
```

- **3. 定义一个rrPicker，它也只有一个方法：**

> func (p *rrPicker) Pick(balancer.PickInfo) (balancer.PickResult, error){…}

rrPicker实际上是**Picker接口的实现：**

```go
type Picker interface {
	Pick(info PickInfo) (PickResult, error)
}
```

- **4. 定义一个newBuild方法用来创建这个策略，定义init方法用来注册创建的策略**

**主要方法作用简单说明：**

1. **Build方法：对连接进行使用前的处理，如果本地连接有变化，如调用**UpdateState(State) **会执行一次此方法，如：在Build中我们可以将某个连接复制多份，或者干脆不处理，直接返回**
2. **Pick方法：每次客户端请求服务前会调用Pick方法拿到一个连接，用这个连接去请求**

**实现基于权重的的负载均衡策略**

上面我们对roundrobin.go有了一个了解后，就可以开始自定义负载均衡策略：基于权重的负载均衡策略（weight_*load_*balance.go），代码结构预览如下：

![image-20230801224602187](/pic/13.png)

详细代码如下

```go
package lb

import (
	"log"
	"math/rand"
	"sync"

	"google.golang.org/grpc/balancer"
	"google.golang.org/grpc/balancer/base"
)

const WEIGHT_LOAD_BALANCE = "weight_lb_picker"
const MAX_WEIGHT = 10 // 可设置的最大权重
const MIN_WEIGHT = 1  // 可设置的最小权重

// 注册自定义权重负载均衡器
func newBuilder() balancer.Builder {
	return base.NewBalancerBuilder(WEIGHT_LOAD_BALANCE, &weightPikerBuilder{}, base.Config{HealthCheck: true})
}

func init() {
	balancer.Register(newBuilder())
}

type weightPikerBuilder struct {
}

// 根据负载均衡策略 生成重复的连接

func (p *weightPikerBuilder) Build(info base.PickerBuildInfo) balancer.Picker {

	log.Println("weightPikerBuilder build called...")

	// 没有可用的连接
	if len(info.ReadySCs) == 0 {
		return base.NewErrPicker(balancer.ErrNoSubConnAvailable)
	}

	// 此处有坑，为什么长度给0,而不是1???

	scs := make([]balancer.SubConn, 0, len(info.ReadySCs))

	for subConn, subConnInfo := range info.ReadySCs {
		//v := subConnInfo.Address.BalancerAttributes.Value(WeightAttributeKey{})
		w := subConnInfo.Address.Attributes.Value("weight").(int)

		// 限制可以设置的最大最小权重，防止设置过大创建连接数太多
		if w < MIN_WEIGHT {
			w = MIN_WEIGHT
		}

		if w > MAX_WEIGHT {
			w = MAX_WEIGHT
		}

		// 根据权重 创建多个重复的连接 权重越高个数越多
		for i := 0; i < w; i++ {
			scs = append(scs, subConn)
		}

	}

	return &weightPiker{
		scs: scs,
	}
}

type weightPiker struct {
	scs []balancer.SubConn
	mu  sync.Mutex
}

// 从build方法生成的连接数中选择一个连接返回

func (p *weightPiker) Pick(info balancer.PickInfo) (balancer.PickResult, error) {

	// 随机选择一个返回，权重越大，生成的连接个数越多，因此，被选中的概率也越大
	log.Println("weightPiker Pick called...")
	p.mu.Lock()
	index := rand.Intn(len(p.scs))
	sc := p.scs[index]
	p.mu.Unlock()
	return balancer.PickResult{SubConn: sc}, nil
}
```

既然是基于权重的负载均衡策略，因此，我们在解析IP时需要获取权重值，在获取IP时我们又需要将对应的权重设置到我们的Addr中，通过上一篇将grpc服务注册到etcd中我们知道可以调用discovery包中的updata方法设置地址，因此我们可以在设置地址时增加一些属性，如：权重，下图中的129行代码。

![image-20230801231343262](/pic/14.png)

使用，在调用Dial函数创建`ClientConn`连接的时候传入，

```go
grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"weight_lb_picker"}`
```

```go
// 连接服务器
conn, err := grpc.Dial(etcdResolverBuilder.Scheme()+":///user-service-1/v1", grpc.WithTransportCredentials(insecure.NewCredentials()), grpc.WithDefaultServiceConfig(
   `{"loadBalancingPolicy":"weight_lb_picker"}`,
))
```

这样就会使用我们自定义的负载均衡策略来选择服务节点。

创建多个服务节点的服务端，客户端选择的结果如下图所示，其中80端口的服务权重是8， 81端口的服务权重是2，可以看到80端口更容易被选中。

![image-20230801235431462](/pic/15.png)

源码获取：[AngryPotato/grpc-etcd]([Jack-Ken/grpc-etcd (github.com)](https://github.com/Jack-Ken/grpc-etcd))
