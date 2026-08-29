---
title: "面试准备-Go接口"
date: 2023-11-05
draft: false
tags: []
categories: ["Go面试"]
summary: "面试准备-Go接口1、值接收者与指针接受者的区别以及两者的使用时机 我们都知道，如果要实现一个接口，必须实现这个接口提供的所有方法，但是实现方法的时候，我们可以使用指针接收者实..."
---

## 1、值接收者与指针接受者的区别以及两者的使用时机

我们都知道，如果要实现一个接口，必须实现这个接口提供的所有方法，但是实现方法的时候，我们可以使用指针接收者实现，也可以使用值接收者实现，这两者是有区别的

下面是一个例子

```go
package main

import "fmt"

type coder interface {
	code()
	debug()
}

type Gopher struct {
	language string
}

func (p Gopher) code() {
	fmt.Printf("I am coding %s language\n", p.language)
}

func (p *Gopher) debug() {
	fmt.Printf("I am debuging %s language\n", p.language)
}

func main() {
	var c coder = &Gopher{"Go"}
	c.code()
	c.debug()
}
```

可以看到上述代码定义了一个接口`coder`，接口定义可两个函数

```go
code()
debug()
```

接着定义了一个结构体 `Gopher`，它实现了两个方法，一个值接收者，一个指针接收者。我们使用指针类型的调用者来调用定义的两个函数。结果可以正常运行：

```go
I am coding Go language
I am debuging Go language
```

但是如果我们把 `main` 函数的第一条语句换一下：

```go
func main() {
	var c coder = Gopher{"Go"}
	c.code()
	c.debug()
}
```

运行报错

```shell
src/main.go:23:6: cannot use Gopher literal (type Gopher) as type coder in assignment:
	Gopher does not implement coder (debug method has pointer receiver)
```

通过这个例子我们可得出结论：

- **实体类型以值接收者实现接口的时候，不管是实体类型的值，还是实体类型值的指针，都实现了该接口**。
- **实体类型以指针接收者实现接口的时候，只有指向这个类型的指针才被认为实现了该接口**

## 2、两者分别在什么时候使用

如果方法的接收者是值类型，无论调用者是对象还是对象指针，修改的都是对象的副本，不影响调用者；如果方法的接收者是指针类型，则调用者修改的是指针指向的对象本身。

使用指针作为方法的接收者的理由：

- 方法能够修改接收者指向的值。
- 避免在每次调用方法时复制该值，在值的类型为大型结构体时，这样做会更加高效。

是使用值接收者还是指针接收者，不是由该方法是否修改了调用者（也就是接收者）来决定，而是应该基于该类型的`本质`。

## 3、iface和eface

`iface` 和 `eface` 都是 Go 中描述接口的底层结构体，区别在于 **`iface` 描述的接口包含方法，而 `eface` 则是不包含任何方法的空接口：`interface{}`。**

```go
type iface struct {
	tab  *itab
	data unsafe.Pointer
}

type itab struct {
	inter  *interfacetype  // 接口类型
	_type  *_type  // 实体类型
	link   *itab
	hash   uint32 // copy of _type.hash. Used for type switches.
	bad    bool   // type does not implement interface
	inhash bool   // has this itab been added to hash?
	unused [2]byte
	fun    [1]uintptr // 放置和接口方法对应的具体数据类型的方法地址
}
```

`iface` 内部维护两个指针，`tab` 指向一个 `itab` 实体， 它表示接口的类型以及赋给这个接口的实体类型。`data` 则指向接口具体的值，一般而言是一个指向堆内存的指针。

再来仔细看一下 `itab` 结构体：`_type` 字段描述了实体的类型，包括内存对齐方式，大小等；`inter` 字段则描述了接口的类型。`fun` 字段放置和接口方法对应的具体数据类型的方法地址，实现接口调用方法的动态分派，一般在每次给接口赋值发生转换时会更新此表，或者直接拿缓存的 itab。

这里只会列出实体类型和接口相关的方法，实体类型的其他方法并不会出现在这里。

再看一下 `interfacetype` 类型，它描述的是接口的类型：

```golang
type interfacetype struct {
	typ     _type
	pkgpath name
	mhdr    []imethod
}
```

可以看到，它包装了 `_type` 类型，`_type` 实际上是描述 Go 语言中各种数据类型的结构体。我们注意到，这里还包含一个 `mhdr` 字段，表示接口所定义的函数列表， `pkgpath` 记录定义了接口的包名。

这里通过一张图来看下 `iface` 结构体的全貌：

![iface 结构体全景](/pic/0.png)

接着来看一下 `eface` 的源码：

```golang
type eface struct {
    _type *_type
    data  unsafe.Pointer
}
```

## 4、接口的动态类型和动态值

从源码里可以看到：`iface`包含两个字段：`tab` 是接口表指针，指向类型信息；`data` 是数据指针，则指向具体的数据。它们分别被称为`动态类型`和`动态值`。而接口值包括`动态类型`和`动态值`。简单来说，动态类型就是实现接口的类型，动态值就是实现接口的类型的值。除此以外，接口的静态类型就是接口本身。

- 引申1、接口类型和`nil`作比较

接口值的零值是指`动态类型`和`动态值`都为 `nil`。当仅且当这两部分的值都为 `nil` 的情况下，这个接口值就才会被认为 `接口值 == nil`。

```golang
package main

import "fmt"

type Coder interface {
	code()
}

type Gopher struct {
	name string
}

func (g Gopher) code() {
	fmt.Printf("%s is coding\n", g.name)
}

func main() {
	var c Coder
	fmt.Println(c == nil)
	fmt.Printf("c: %T, %v\n", c, c)

	var g *Gopher
	fmt.Println(g == nil)

	c = g
	fmt.Println(c == nil)
	fmt.Printf("c: %T, %v\n", c, c)
}
```

输出：

```shell
true
c: <nil>, <nil>
true
false
c: *main.Gopher, <nil>
```

一开始，`c` 的 动态类型和动态值都为 `nil`，`g` 也为 `nil`，当把 `g` 赋值给 `c` 后，`c` 的动态类型变成了 `*main.Gopher`，仅管 `c` 的动态值仍为 `nil`，但是当 `c` 和 `nil` 作比较的时候，结果就是 `false` 了。

- 引申2、来看一个例子，看一下它的输出：

  ```golang
package main

  import "fmt"

  type MyError struct {}

  func (i MyError) Error() string {
	return "MyError"
}

  func main() {
	err := Process()
	fmt.Println(err)

  	fmt.Println(err == nil)
}

  func Process() error {
	var err *MyError = nil
	return err
}
```

  函数运行结果：

  ```shell
<nil>
false
```

  这里先定义了一个 `MyError` 结构体，实现了 `Error` 函数，也就实现了 `error` 接口。`Process` 函数返回了一个 `error` 接口，这块隐含了类型转换。所以，虽然它的值是 `nil`，其实它的类型是 `*MyError`，最后和 `nil` 比较的时候，结果为 `false`。
- 引申3、如何打印出接口的动态类型和值？

  ```golang
package main

  import (
	"unsafe"
	"fmt"
)

  type iface struct {
	itab, data uintptr
}

  func main() {
	var a interface{} = nil

  	var b interface{} = (*int)(nil)

  	x := 5
	var c interface{} = (*int)(&x)

	ia := *(*iface)(unsafe.Pointer(&a))
	ib := *(*iface)(unsafe.Pointer(&b))
	ic := *(*iface)(unsafe.Pointer(&c))

  	fmt.Println(ia, ib, ic)

  	fmt.Println(*(*int)(unsafe.Pointer(ic.data)))
}
```

  代码里直接定义了一个 `iface` 结构体，用两个指针来描述 `itab` 和 `data`，之后将 a, b, c 在内存中的内容强制解释成我们自定义的 `iface`。最后就可以打印出动态类型和动态值的地址。

  运行结果如下：

  ```shell
{0 0} {17426912 0} {17426912 842350714568}
5
```

  a 的动态类型和动态值的地址均为 0，也就是 nil；b 的动态类型和 c 的动态类型一致，都是 `*int`；最后，c 的动态值为 5。

## 5、编译器自动检测类型是否实现接口

我们在一些开源库中看到下面这中奇怪的用法

```go
var _ io.Writer = (*myWriter)(nil)
```

此时，编译器会由此检查`*myWriter`是否实现了`io.Writer`接口。

来看一个例子：

```go
package main

import "io"

type myWriter struct {

}

/*func (w myWriter) Write(p []byte) (n int, err error) {
	return
}*/

func main() {
    // 检查 *myWriter 类型是否实现了 io.Writer 接口
    var _ io.Writer = (*myWriter)(nil)

    // 检查 myWriter 类型是否实现了 io.Writer 接口
    var _ io.Writer = myWriter{}
}
```

注释掉为 myWriter 定义的 Write 函数后，运行程序：

```golang
src/main.go:14:6: cannot use (*myWriter)(nil) (type *myWriter) as type io.Writer in assignment:
	*myWriter does not implement io.Writer (missing Write method)
src/main.go:15:6: cannot use myWriter literal (type myWriter) as type io.Writer in assignment:
	myWriter does not implement io.Writer (missing Write method)
```

当我们删除注释之后，运行程序就不会报错。

实际上，上述赋值语句会发生隐式地类型转换，在转换的过程中，编译器会检测等号右边的类型是否实现了等号左边接口所规定的函数。

所以我们可以在代码中添加类似的代码，用来检查类型是否实现了接口：

```golang
var _ io.Writer = (*myWriter)(nil)
var _ io.Writer = myWriter{}
```

- 引申 如何打印出接口类型的Hash值？

  ```golang
type iface struct {
	tab  *itab
	data unsafe.Pointer
}
type itab struct {
	inter uintptr
	_type uintptr
	link uintptr
	hash  uint32
	_     [4]byte
	fun   [1]uintptr
}

  func main() {
	var qcrao = Person(Student{age: 18})

  	iface := (*iface)(unsafe.Pointer(&qcrao))
	fmt.Printf("iface.tab.hash = %#x\n", iface.tab.hash)
}
```

  定义了一个`山寨版`的 `iface` 和 `itab`，说它`山寨`是因为 `itab` 里的一些关键数据结构都不具体展开了，比如 `_type`，对比一下正宗的定义就可以发现，但是`山寨版`依然能工作，因为 `_type` 就是一个指针而已嘛。

  在 `main` 函数里，先构造出一个接口对象 `qcrao`，然后强制类型转换，最后读取出 `hash` 值，非常妙！你也可以自己动手试一下。

  运行结果：

  ```shell
iface.tab.hash = 0xd4209fda
```

  值得一提的是，构造接口 `qcrao` 的时候，即使我把 `age` 写成其他值，得到的 `hash` 值依然不变的，这应该是可以预料的，`hash` 值只和他的字段、方法相关。

## 6、类型转换和断言的区别

对于`类型转换`而言，转换前后的两个类型要相互兼容才行。类型转换的语法为：

> <结果类型> := <目标类型> ( <表达式> )

前面说过，因为空接口 `interface{}` 没有定义任何函数，因此 Go 中所有类型都实现了空接口。当一个函数的形参是 `interface{}`，那么在函数中，需要对形参进行断言，从而得到它的真实类型。

断言的语法为：

> <目标类型的值>，<布尔参数> := <表达式>.( 目标类型 ) // 安全类型断言 <目标类型的值> := <表达式>.( 目标类型 )　　//非安全类型断言

**类型转换和类型断言有些相似，不同之处，在于类型断言是对接口进行的操作。**

来看一个简单的例子：

```go
package main

import "fmt"

type Student struct {
	Name string
	Age int
}

func main() {
	var i interface{} = new(Student)
	s := i.(Student)

	fmt.Println(s)
}
```

运行一下：

```shell
panic: interface conversion: interface {} is *main.Student, not main.Student
```

直接 `panic` 了，这是因为 `i` 是 `*Student` 类型，并非 `Student` 类型，断言失败。这里直接发生了 `panic`，线上代码可能并不适合这样做，可以采用“安全断言”的语法：

```golang
func main() {
	var i interface{} = new(Student)
	s, ok := i.(Student)
	if ok {
		fmt.Println(s)
	}
}
```

这样，即使断言失败也不会 `panic`。

断言其实还有另一种形式，就是用在利用 `switch` 语句判断接口的类型。每一个 `case` 会被顺序地考虑。当命中一个 `case` 时，就会执行 `case` 中的语句，因此 `case` 语句的顺序是很重要的，因为很有可能会有多个 `case` 匹配的情况。

```go
func main() {
	//var i interface{} = new(Student)
	//var i interface{} = (*Student)(nil)
	var i interface{}

	fmt.Printf("%p %v\n", &i, i)

	judge(i)
}

func judge(v interface{}) {
	fmt.Printf("%p %v\n", &v, v)

	switch v := v.(type) {
	case nil:
		fmt.Printf("%p %v\n", &v, v)
		fmt.Printf("nil type[%T] %v\n", v, v)

	case Student:
		fmt.Printf("%p %v\n", &v, v)
		fmt.Printf("Student type[%T] %v\n", v, v)

	case *Student:
		fmt.Printf("%p %v\n", &v, v)
		fmt.Printf("*Student type[%T] %v\n", v, v)

	default:
		fmt.Printf("%p %v\n", &v, v)
		fmt.Printf("unknow\n")
	}
}

type Student struct {
	Name string
	Age int
}
```

`main` 函数里有三行不同的声明，每次运行一行，注释另外两行，得到三组运行结果：

```shell
// --- var i interface{} = new(Student)
0xc4200701b0 [Name: ], [Age: 0]
0xc4200701d0 [Name: ], [Age: 0]
0xc420080020 [Name: ], [Age: 0]
*Student type[*main.Student] [Name: ], [Age: 0]

// --- var i interface{} = (*Student)(nil)
0xc42000e1d0 <nil>
0xc42000e1f0 <nil>
0xc42000c030 <nil>
*Student type[*main.Student] <nil>

// --- var i interface{}
0xc42000e1d0 <nil>
0xc42000e1e0 <nil>
0xc42000e1f0 <nil>
nil type[<nil>] <nil>
```

对于第一行语句：

```golang
var i interface{} = new(Student)
```

`i` 是一个 `*Student` 类型，匹配上第三个 case，从打印的三个地址来看，这三处的变量实际上都是不一样的。在 `main` 函数里有一个局部变量 `i`；调用函数时，实际上是复制了一份参数，因此函数里又有一个变量 `v`，它是 `i` 的拷贝；断言之后，又生成了一份新的拷贝。所以最终打印的三个变量的地址都不一样。

对于第二行语句：

```golang
var i interface{} = (*Student)(nil)
```

这里想说明的其实是 `i` 在这里动态类型是 `(*Student)`, 数据为 `nil`，它的类型并不是 `nil`，它与 `nil` 作比较的时候，得到的结果也是 `false`。

最后一行语句：

```golang
var i interface{}
```

这回 `i` 才是 `nil` 类型。

**【引申1】** `fmt.Println` 函数的参数是 `interface`。对于内置类型，函数内部会用穷举法，得出它的真实类型，然后转换为字符串打印。而对于自定义类型，首先确定该类型是否实现了 `String()` 方法，如果实现了，则直接打印输出 `String()` 方法的结果；否则，会通过反射来遍历对象的成员进行打印。

再来看一个简短的例子，比较简单，不要紧张：

```golang
package main

import "fmt"

type Student struct {
	Name string
	Age int
}

func main() {
	var s = Student{
		Name: "qcrao",
		Age: 18,
	}

	fmt.Println(s)
}
```

因为 `Student` 结构体没有实现 `String()` 方法，所以 `fmt.Println` 会利用反射挨个打印成员变量：

```shell
{qcrao 18}
```

增加一个 `String()` 方法的实现：

```golang
func (s Student) String() string {
	return fmt.Sprintf("[Name: %s], [Age: %d]", s.Name, s.Age)
}
```

打印结果：

```shell
[Name: qcrao], [Age: 18]
```

**【引申2】**针对上面的例子，如果改一下：

```goalng
func (s *Student) String() string {
	return fmt.Sprintf("[Name: %s], [Age: %d]", s.Name, s.Age)
}
```

注意看两个函数的接受者类型不同，现在 `Student` 结构体只有一个接受者类型为 `指针类型` 的 `String()` 函数，打印结果：

```shell
{qcrao 18}
```

因为String函数的接受者是指针，所以只有调用类型的指针类型才可以调用。

所以， `Student` 结构体定义了接受者类型是值类型的 `String()` 方法时，通过

```golang
fmt.Println(s)
fmt.Println(&s)
```

均可以按照自定义的格式来打印。

如果 `Student` 结构体定义了接受者类型是指针类型的 `String()` 方法时，只有通过

```golang
fmt.Println(&s)
```

才能按照自定义的格式打印。

## 7、接口的类型转换

前面我们了解了iface通过itab结构体描述非空接口的细节，包括接口方法定义，接口方法实现地址等。iface是非空接口的实现，而不是类型定义，iface的真正类型为interfacetype，interfacetype是描述接口类型定义的数据结构。

为了提高查找效率，runtime中实现了（interfacetype，concrete_type） -> itab（包含具体实现地址信息）的hash表，其中interfacetype表示接口类型，concrete_type是实体类型。

当判定某一类型是否满足某个接口的时候，Go 使用实体类型的方法集和接口所需要的方法集进行匹配，如果类型的方法集完全包含接口的方法集，则可认为该类型实现了该接口。例如某类型有m个方法，某接口有n个方法，则很容易知道这种判定的时间复杂度为 `O(mn)`，**Go 会对方法集的函数按照函数名的字典序进行排序，所以实际的时间复杂度为 `O(m+n)`**。

下面是一个接口转换为接口的例子

```go
package main

import "fmt"

type coder interface {
	code()
	run()
}

type runner interface {
	run()
}

type Gopher struct {
	language string
}

func (g Gopher) code() {
	return
}

func (g Gopher) run() {
	return
}

func main() {
	var c coder = Gopher{}

	var r runner
	r = c
	fmt.Println(c, r)
}
```

执行命令 go tool compile -S ./src/main.go 后的编译结果如下：

```shell
0x0000 00000 (.\I2I.go:26)      TEXT    "".main(SB), ABIInternal, $104-0
        0x0000 00000 (.\I2I.go:26)      CMPQ    SP, 16(R14)
        0x0004 00004 (.\I2I.go:26)      PCDATA  $0, $-2
        0x0004 00004 (.\I2I.go:26)      JLS     164
        0x000a 00010 (.\I2I.go:26)      PCDATA  $0, $-1
        0x000a 00010 (.\I2I.go:26)      SUBQ    $104, SP
        0x000e 00014 (.\I2I.go:26)      MOVQ    BP, 96(SP)
        0x0013 00019 (.\I2I.go:26)      LEAQ    96(SP), BP
        0x0018 00024 (.\I2I.go:26)      FUNCDATA        $0, gclocals·69c1753bd5f81501d95132d08af04464(SB)
        0x0018 00024 (.\I2I.go:26)      FUNCDATA        $1, gclocals·232077072e4d4c4b841d7a2024b5b669(SB)
        0x0018 00024 (.\I2I.go:26)      FUNCDATA        $2, "".main.stkobj(SB)
        0x0018 00024 (.\I2I.go:27)      MOVUPS  X15, ""..autotmp_10+48(SP)
        0x001e 00030 (.\I2I.go:27)      MOVQ    ""..autotmp_10+48(SP), AX
        0x0023 00035 (.\I2I.go:27)      XORL    BX, BX
        0x0025 00037 (.\I2I.go:27)      PCDATA  $1, $0
        0x0025 00037 (.\I2I.go:27)      CALL    runtime.convTstring(SB)
        0x002a 00042 (.\I2I.go:27)      MOVQ    AX, ""..autotmp_27+40(SP)
        0x002f 00047 (.\I2I.go:30)      LEAQ    go.itab."".Gopher,"".coder(SB), BX
        0x0036 00054 (.\I2I.go:30)      LEAQ    type."".runner(SB), AX
        0x003d 00061 (.\I2I.go:30)      PCDATA  $1, $1
        0x003d 00061 (.\I2I.go:30)      NOP
        0x0040 00064 (.\I2I.go:30)      CALL    runtime.convI2I(SB)
        0x0045 00069 (.\I2I.go:31)      MOVUPS  X15, ""..autotmp_15+64(SP)
        ......
```

从编译结果可以看到在 r=c 这一行主要调用的是`runtime.convI2I(SB)`,这是将一个 `interface` 转换成另外一个 `interface`，看一下源码：

```go
func convI2I(inter *interfacetype, i iface) (r iface) {
	tab := i.tab
	if tab == nil {
		return
	}
	if tab.inter == inter {
		r.tab = tab
		r.data = i.data
		return
	}
	r.tab = getitab(inter, tab._type, false)
	r.data = i.data
	return
}
```

我们知道， `iface` 是由 `tab` 和 `data` 两个字段组成。所以，实际上 `convI2I` 函数真正要做的事，找到新 `interface` 的 `tab` 和 `data`，就大功告成了。我们还知道，`tab` 是由接口类型 `interfacetype` 和 实体类型 `_type`。所以最关键的语句是 `r.tab = getitab(inter, tab._type, false)`。

我们重点看一下 `getitab` 函数的源码：

```go
// runtime/iface.go
const (
   hashSize = 1009
)

var (
   ifaceLock mutex // lock for accessing hash
   hash      [hashSize]*itab
)
// 简单的Hash算法
func itabhash(inter *interfacetype, typ *_type) uint32 {
   h := inter.typ.hash
   h += 17 * typ.hash
   return h % hashSize
}

func getitab(inter *interfacetype, typ *_type, canfail bool) *itab {
	// ……

    // 根据 inter, typ 计算出 hash 值
	h := itabhash(inter, typ)

	// look twice - once without lock, once with.
	// common case will be no lock contention.
	var m *itab
	var locked int
	for locked = 0; locked < 2; locked++ {
		if locked != 0 {
			lock(&ifaceLock)
        }

        // 遍历哈希表的一个 slot
		for m = (*itab)(atomic.Loadp(unsafe.Pointer(&hash[h]))); m != nil; m = m.link {

            // 如果在 hash 表中已经找到了 itab（inter 和 typ 指针都相同）
			if m.inter == inter && m._type == typ {
                // ……

				if locked != 0 {
					unlock(&ifaceLock)
				}
				return m
			}
		}
	}

    // 在 hash 表中没有找到 itab，那么新生成一个 itab
	m = (*itab)(persistentalloc(unsafe.Sizeof(itab{})+uintptr(len(inter.mhdr)-1)*sys.PtrSize, 0, &memstats.other_sys))
	m.inter = inter
    m._type = typ

    // 添加到全局的 hash 表中
	additab(m, true, canfail)
	unlock(&ifaceLock)
	if m.bad {
		return nil
	}
	return m
}
```

简单总结一下：getitab 函数会根据 `interfacetype` 和 `_type` 去全局的 itab 哈希表中查找，如果能找到，则直接返回；否则，会根据给定的 `interfacetype` 和 `_type` 新生成一个 `itab`，并插入到 itab 哈希表，这样下一次就可以直接拿到 `itab`。

这里查找了两次，并且第二次上锁了，这是因为如果第一次没找到，在第二次仍然没有找到相应的 `itab` 的情况下，需要新生成一个，并且写入哈希表，因此需要加锁。这样，其他协程在查找相同的 `itab` 并且也没有找到时，第二次查找时，会被挂住，之后，就会查到第一个协程写入哈希表的 `itab`。

再来看一下`additab` 函数的代码：

```go
// 检查 _type 是否符合 interface_type 并且创建对应的 itab 结构体 将其放到 hash 表中
func additab(m *itab, locked, canfail bool) {
	inter := m.inter
	typ := m._type
	x := typ.uncommon()

	// both inter and typ have method sorted by name,
	// and interface names are unique,
	// so can iterate over both in lock step;
    // the loop is O(ni+nt) not O(ni*nt).
    //
    // inter 和 typ 的方法都按方法名称进行了排序
    // 并且方法名都是唯一的。所以循环的次数是固定的
    // 只用循环 O(ni+nt)，而非 O(ni*nt)
	ni := len(inter.mhdr)
	nt := int(x.mcount)
	xmhdr := (*[1 << 16]method)(add(unsafe.Pointer(x), uintptr(x.moff)))[:nt:nt]
	j := 0
	for k := 0; k < ni; k++ {
		i := &inter.mhdr[k]
		itype := inter.typ.typeOff(i.ityp)
		name := inter.typ.nameOff(i.name)
		iname := name.name()
		ipkg := name.pkgPath()
		if ipkg == "" {
			ipkg = inter.pkgpath.name()
		}
		for ; j < nt; j++ {
			t := &xmhdr[j]
            tname := typ.nameOff(t.name)
            // 检查方法名字是否一致
			if typ.typeOff(t.mtyp) == itype && tname.name() == iname {
				pkgPath := tname.pkgPath()
				if pkgPath == "" {
					pkgPath = typ.nameOff(x.pkgpath).name()
				}
				if tname.isExported() || pkgPath == ipkg {
					if m != nil {
                        // 获取函数地址，并加入到itab.fun数组中
						ifn := typ.textOff(t.ifn)
						*(*unsafe.Pointer)(add(unsafe.Pointer(&m.fun[0]), uintptr(k)*sys.PtrSize)) = ifn
					}
					goto nextimethod
				}
			}
		}
        // ……

		m.bad = true
		break
	nextimethod:
	}
	if !locked {
		throw("invalid itab locking")
    }

    // 计算 hash 值
    h := itabhash(inter, typ)
    // 加到Hash Slot链表中
	m.link = hash[h]
	m.inhash = true
	atomicstorep(unsafe.Pointer(&hash[h]), unsafe.Pointer(m))
}
```

`additab` 会检查 `itab` 持有的 `interfacetype` 和 `_type` 是否符合，就是看 `_type` 是否完全实现了 `interfacetype` 的方法，也就是看两者的方法列表重叠的部分就是 `interfacetype` 所持有的方法列表。注意到其中有一个双层循环，乍一看，循环次数是 `ni * nt`，但由于两者的函数列表都按照函数名称进行了排序，因此最终只执行了 `ni + nt` 次，代码里通过一个小技巧来实现：第二层循环并没有从 0 开始计数，而是从上一次遍历到的位置开始。

&e**msp;并不是每次接口赋值都要去检查一次对象是否符合接口要求，而是只在第一次生成itab信息，之后通过hash表即可找到itab信息。**

**总结：**

- 具体类型转空接口时，_type 字段直接复制源类型的 _type；调用 mallocgc 获得一块新内存，把值复制进去，data 再指向这块新内存。
- 具体类型转非空接口时，入参 tab 是编译器在编译阶段预先生成好的，新接口 tab 字段直接指向入参 tab 指向的 itab；调用 mallocgc 获得一块新内存，把值复制进去，data 再指向这块新内存。
- 而对于接口转接口，itab 调用 getitab 函数获取。只用生成一次，之后直接从 hash 表中获取。

## 8、interface实现多态

多态是一种运行期的行为，它有以下几个特点：

> 1. 一种类型具有多种类型的能力
> 2. 允许不同的对象对同一消息做出灵活的反应
> 3. 以一种通用的方式对待个使用的对象
> 4. 非动态语言必须通过继承和接口的方式来实现

多态实现：

当我们调用接口类型的函数时，根据前面iface分析，我们会直接调用itab中的fun里保存的函数，类似于：`s.tab->fun[0]`，而因为fun里面保存的是实体类型实现的函数，所以当函数传入实现同一接口的不同实体类型的时候，调用的实际上是不同的函数实现，从而实现多态。

## 9、Go接口与C++接口有何异同

接口定义了一种规范，描述了类的行为和功能，而不做具体实现。

C++ 的接口是使用抽象类来实现的，如果类中至少有一个函数被声明为纯虚函数，则这个类就是抽象类。纯虚函数是通过在声明中使用 “= 0” 来指定的。例如：

```C
class Shape
{
   public:
      // 纯虚函数
      virtual double getArea() = 0;
   private:
      string name;      // 名称
};
```

设计抽象类的目的，是为了给其他类提供一个可以继承的适当的基类。抽象类不能被用于实例化对象，它只能作为接口使用。

**派生类需要明确地声明它继承自基类，并且需要实现基类中所有的纯虚函数。**

C++ 定义接口的方式称为“侵入式”，而 Go 采用的是 “非侵入式”，不需要显式声明，只需要实现接口定义的函数，编译器自动会识别。

C++ 和 Go 在定义接口方式上的不同，也导致了底层实现上的不同。C++ 通过虚函数表来实现基类调用派生类的函数；而 Go 通过 `itab` 中的 `fun` 字段来实现接口变量调用实体类型的函数。C++ 中的虚函数表是在编译期生成的；而 Go 的 `itab` 中的 `fun` 字段是在运行期间动态生成的。原因在于，Go 中实体类型可能会无意中实现 N 多接口，很多接口并不是本来需要的，所以不能为类型实现的所有接口都生成一个 `itab`， 这也是“非侵入式”带来的影响；这在 C++ 中是不存在的，因为派生需要显示声明它继承自哪个基类。
