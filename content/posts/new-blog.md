---
title: "新博客，开工"
date: 2026-08-20
draft: false
tags: ["随笔"]
categories: ["随笔"]
summary: "博客从 Hexo + GitHub Pages 迁移到 Hugo + 自建服务器，记录一下新工作流。"
---

博客重新开张了。旧博客托管在 GitHub Pages 上，这次迁移到了自己的服务器，顺便把整套工具链换成了更省心的组合。

## 新的工作流

写一篇文章只需要三步：

```bash
# 1. 新建文章（会生成带 front matter 的模板）
hugo new content posts/my-post.md

# 2. 本地预览，边写边看效果
hugo server -D

# 3. 写完发布
git add . && git commit -m "post: 我的新文章" && git push
```

`git push` 之后，GitHub Actions 会自动构建并把静态文件同步到服务器，全程不需要手动碰服务器。

## 为什么选 Hugo

旧的 Hexo 用了几年，痛点是 Node 依赖链：升级插件经常把构建搞挂。Hugo 是单个二进制文件，没有任何运行时依赖，几百篇文章的构建也是毫秒级的。

对这个博客来说，RSS、归档、标签、全文搜索都是开箱即用的，评论交给 Giscus，访问统计用自托管的 Umami——服务器上常驻的只有一个 Nginx。

## 接下来

- [ ] 把旧博客的文章迁移过来
- [ ] 配好 Giscus 评论
- [ ] 服务器上把 Umami 跑起来

如果你也想搭一个这样的博客，可以参考仓库里的 `DEPLOY.md`。
