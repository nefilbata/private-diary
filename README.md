# 私密心情日记

这是一个简洁的日记网站原型，包含账号登录、情绪记录、心情分类、标签、日期时间、时间轴、评论、图片入口和选择性导出。

## 先试用

直接打开 `index.html`，或在这个目录启动一个本地静态服务。没有填写 Supabase 信息前，应用会进入本机演示模式，数据只保存在当前浏览器。

## 接入 Supabase

1. 在 Supabase 新建项目。
2. 打开 SQL Editor，运行 `supabase-schema.sql`。
3. 在 Authentication 里开启 Email 登录。
4. 打开 `app.js`，填写：

```js
const SUPABASE_URL = "你的项目 URL";
const SUPABASE_ANON_KEY = "你的 anon public key";
```

完成后，日记会按 Supabase 账号隔离保存。数据库已开启 Row Level Security，每个用户只能读写自己的记录。

## 当前功能

- 邮箱注册和登录
- 日记标题、内容、日期、时间
- 常用心情和自定义心情
- 标签分类
- 简洁时间轴
- 每条日记的评论 / 后续想法
- 图片添加入口
- 勾选记录后导出 JSON 或 CSV
- Supabase 私密数据策略
