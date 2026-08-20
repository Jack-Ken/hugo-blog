# 部署指南

本博客的部署链路：

```
本地写 Markdown -> git push -> GitHub Actions 构建 Hugo
  -> rsync 同步到服务器 -> Nginx 对外提供访问
```

以下步骤**只需要做一次**，之后日常发文只有 `git push` 一步。

---

## 一、服务器准备（一次性）

假设服务器是 Ubuntu/Debian，以 root 或有 sudo 权限的用户登录：

```bash
# 1. 安装 Nginx 和 certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

# 2. 创建网站目录（GitHub Actions 会把构建产物同步到这里）
sudo mkdir -p /var/www/blog

# 3. 部署 Nginx 配置（本文件在仓库 deploy/nginx.conf）
#    先把 deploy/nginx.conf 上传到服务器，例如：
#    scp deploy/nginx.conf user@服务器IP:/tmp/blog-nginx.conf
sudo cp /tmp/blog-nginx.conf /etc/nginx/sites-available/blog
sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 二、DNS 解析（一次性）

到域名服务商控制台，把 `hanchangzhang.top` 从 GitHub Pages 切到你的服务器：

| 记录类型 | 主机记录 | 记录值 |
|---------|---------|-------|
| A | @ | 服务器公网 IP |
| A | www | 服务器公网 IP |

> ⚠️ 切换前，去 GitHub 仓库 `Jack-Ken/Jack-Ken.github.io` 的
> Settings -> Pages 里移除自定义域名，避免两边抢解析。

> ⚠️ 如果服务器在中国大陆，`.top` 域名需要 ICP 备案后才能通过 80/443 对外访问。

## 三、HTTPS 证书（一次性）

DNS 生效后（`ping hanchangzhang.top` 返回你的服务器 IP 即生效）：

```bash
sudo certbot --nginx -d hanchangzhang.top -d www.hanchangzhang.top
```

证书自动续期已由 certbot 的 systemd timer 处理，无需关心。

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
