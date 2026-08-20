# 部署指南

本博客的部署链路：

```
本地写 Markdown -> git push -> GitHub Actions 构建 Hugo
  -> rsync 同步到服务器 -> Nginx 对外提供访问
```

以下步骤**只需要做一次**，之后日常发文只有 `git push` 一步。

> **当前服务器现状**（2026-08 探测）：`121.40.45.174`，Nginx 1.24.0 已在运行，
> `api.hanchangzhang.top` 反代着你的 Go API（证书有效期至 2026-11-04）。
> 下面的所有步骤都**不影响** api 子域的现有服务。

---

## 一、服务器准备（一次性）

Nginx 已装好，只需新增博客站点。先确认你现有配置的存放方式：

```bash
ls /etc/nginx/sites-enabled/ 2>/dev/null || ls /etc/nginx/conf.d/
```

- 如果是 **sites-enabled**（Ubuntu/Debian 默认）：用下面第 3 步的软链方式
- 如果是 **conf.d**：把配置文件直接放到 `/etc/nginx/conf.d/blog.conf`，
  并把文件里的 `server_name` 以外的内容保持不变

```bash
# 1. 创建网站目录（GitHub Actions 会把构建产物同步到这里）
sudo mkdir -p /var/www/blog

# 2. 部署 Nginx 配置（本文件在仓库 deploy/nginx.conf）
#    先把 deploy/nginx.conf 上传到服务器，例如：
#    scp deploy/nginx.conf user@服务器IP:/tmp/blog-nginx.conf
sudo cp /tmp/blog-nginx.conf /etc/nginx/sites-available/blog
sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> ⚠️ 注意：`deploy/nginx.conf` 里的 server_name 是 `hanchangzhang.top www.hanchangzhang.top`，
> 与 api 子域的 server 块互不冲突，可以放心加载。`nginx -t` 通过再 reload。

## 二、清理残留 DNS 解析（一次性）

`hanchangzhang.top` 目前有**两条 A 记录**：一条已指向你的服务器（保留），
另一条 `185.199.108.153` 是 GitHub Pages 的残留（删除）。

到阿里云 DNS 控制台操作：

1. **删除** `@` 记录中值为 `185.199.108.153` 的那条 A 记录
2. **保留** `@` 和 `www` 指向 `121.40.45.174` 的记录（已就位，无需改动）
3. 去 GitHub 仓库 `Jack-Ken/Jack-Ken.github.io` 的 Settings -> Pages 里
   **移除自定义域名**（Custom domain 清空），让 GitHub 彻底放手

改完用 `dig +short hanchangzhang.top` 确认只剩 `121.40.45.174` 一条。

## 三、HTTPS 证书（一次性）

DNS 清理生效后：

```bash
# 服务器上如果还没装 certbot：
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx -d hanchangzhang.top -d www.hanchangzhang.top
```

> 你现在 api 子域用的证书是阿里云免费证书（3 个月有效期，需手动续）。
> 博客这里用 certbot 是因为它自动续期、不用惦记；两个证书各管各的域名，互不影响。
> 如果你更习惯阿里云控制台，也可以再申请一张免费证书给根域名，只是每 3 个月要手动换一次。

## 四、给 GitHub Actions 用的部署密钥（一次性）

Actions 需要以 SSH 登录服务器执行 rsync。推荐单独建一个部署用户和密钥对，
而不是用你自己的日常密钥：

```bash
# 1. 在服务器上创建只用于部署的用户（rsync 会限定在 /var/www/blog 内）
sudo adduser --disabled-password deploy
sudo chown -R deploy:deploy /var/www/blog

# 2. 在本地生成专用密钥对（无口令）
ssh-keygen -t ed25519 -f ~/.ssh/blog_deploy_key -N ""

# 3. 公钥追加到服务器 deploy 用户
cat ~/.ssh/blog_deploy_key.pub | ssh user@服务器IP "mkdir -p /home/deploy/.ssh && cat >> /home/deploy/.ssh/authorized_keys"

# 4. 测试能否免密登录
ssh -i ~/.ssh/blog_deploy_key deploy@服务器IP whoami   # 应输出 deploy
```

## 五、创建 GitHub 仓库并配置 Secrets（一次性）

```bash
# 本地把项目推上去（仓库名随意，比如 blog）
cd ~/blog
git remote add origin git@github.com:Jack-Ken/blog.git
git push -u origin main
```

然后在 GitHub 仓库 **Settings -> Secrets and variables -> Actions** 添加：

| Secret 名 | 值 |
|-----------|---|
| `SSH_PRIVATE_KEY` | `~/.ssh/blog_deploy_key` 文件的**完整内容**（含 BEGIN/END 行） |
| `SSH_HOST` | 服务器公网 IP |
| `SSH_PORT` | SSH 端口（默认 `22`） |
| `SSH_USER` | `deploy` |
| `REMOTE_PATH` | `/var/www/blog/` |

配置完成后随便改一篇文章 push 一下，到仓库的 Actions 页签确认 workflow 跑绿，
然后浏览器访问 `https://hanchangzhang.top`。

## 六、访问统计：Umami（可选）

```bash
# 把 deploy/umami/ 目录上传到服务器后：
cd umami
# 先编辑 docker-compose.yml，把 APP_SECRET 和数据库密码换成随机值
docker compose up -d
```

Nginx 反代和添加网站的步骤见 `deploy/umami/docker-compose.yml` 文件末尾的注释。
配置好后回到博客的 `hugo.toml`，取消注释 `params.analytics.umami` 并填入 website id。

## 七、评论：Giscus（可选）

1. 仓库 Settings -> General -> Features 勾选 **Discussions**
2. 安装 [giscus app](https://github.com/apps/giscus) 并授权给该仓库
3. 到 <https://giscus.app> 按提示选择仓库和分类，生成 `repo-id` / `category-id`
4. 回到 `hugo.toml`，取消注释 `params.comments` 填入对应值，并把 `params.comments = false` 改为 `true`

> 注意：PaperMod 不内置 Giscus 渲染，若启用评论需要按 giscus 文档在文章模板里
> 加一段脚本，或者直接使用支持 Giscus 的主题变体。嫌麻烦可以先用 giscus 官方
> 生成的代码片段放在 `layouts/partials/comments.html` 里试验。

---

## 日常使用速查

```bash
hugo new content posts/文章名.md   # 新建文章
hugo server -D                      # 本地预览（含草稿）
git add . && git commit -m "post: xxx" && git push   # 发布
```

## 故障排查

- **Actions 跑红**：点进失败的任务看日志，最常见的是 SSH 密钥不对或 `REMOTE_PATH` 末尾没带 `/`
- **push 后网站没变**：确认 push 的是 `main` 分支；浏览器可能有 HTML 缓存，强刷（Cmd+Shift+R）
- **证书续期失败**：`sudo certbot renew --dry-run` 检查，通常是 80 端口被防火墙挡了
