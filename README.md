# 松果智序 · Workspace V0.1 个人非商业试用源码预览

用私有工作空间组织成员、记名 Agent、项目和资料，保留提交、退回、修订、再次验收及负责人结案记录。包含只读 Workline 工作板和六种管理方法指南。

**自有代码仅限个人非商业试用，不授予商用许可。** 这是公开的受限源码预览，不是通用开源授权，尚无面向公众的运行产品服务，也不代表生产 READY。条款见 [LICENSE](LICENSE)。第三方原有权利独立保留，见 [NOTICE.md](NOTICE.md)、[第三方许可正文](third-party/README.md) 和 [LICENSE-STATUS.md](LICENSE-STATUS.md)。

[English](README.en.md)

## 版本和验收范围

| 基线 | 已有结果 | 与当前源码的关系 |
| --- | --- | --- |
| `7f85eed66af205df9ed96579d8ad0c2f30f3c8e1` | 曾完成隔离空库、HTTP/浏览器、ACL、重复安装和重启回读 | 历史运行验收基线，不能当作新包测试结果 |
| `edc21795b1d7848770919d6a0a1a04c1294ce11d` | 上下文清理、未使用 CSS 删除和通用模板说明的针对性静态/导出检查通过 | 六方法与 Workline 保留；新运行验收未执行 |
| 当前包 | 在 edc2179 代码上加入第三方许可正文、NOTICE、说明和发布清单 | 运行代码与 edc2179 相同；准确版本和文件哈希见 `release-manifest.json` |

当前包的构建、HTTP/浏览器、安装和恢复验收为 **NOT_RUN**。源码发布不等于公众托管、恢复验收或镜像审查已通过。

## 能力和限制

结构化事实只保存在 PostgreSQL，由 NocoBase 提供持久化及通用数据服务，Next.js 提供工作空间界面和带租户授权的接口。人类负责人直接编辑普通事实并验收成果；Agent 只有实际调用连接接口且通过身份校验后才显示可用。松果不托管 AI 推理、不自动运行 Agent，不提供完整甘特、知识问答或企业业务模块。

`/workspace` 是真实工作空间入口，`/demo` 是完全虚构的交互示例。一个任务被接受不会自动完成项目。演示数据、测试账号和真实用户数据必须分开；此候选仅在隔离本机安装验收。

## 本机空库安装

需要 Linux、Node.js 22、Docker Engine 和 Compose 2.24 以上版本。先检查磁盘空间；NocoBase 解包和数据库需要额外空间。配方从第三方拉取镜像，不在此包中携带镜像、源码或数据库。当前镜像版本仍待发布级操作系统及容器安全审计。

在本候选目录执行，两个端口必须空闲。不要与其他 Compose 文件合并。

```sh
node tools/private-install.mjs init acceptance 23501 23500
node tools/private-install.mjs check acceptance
node tools/private-install.mjs install acceptance
```

打开 `http://127.0.0.1:23501/workspace`，注册虚构用户并走首次向导。数据库不映射宿主端口；后台和网页只监听回环地址。此配方允许本机 HTTP Cookie，不可原样用于公网。

安装器在 `.private-install/acceptance/` 生成独立密钥、UUID 和目录标记，只操作对应 `songguo-private-acceptance` 项目。它不读取根 `.env`、不采用旧数据、不覆盖密钥、不自动清卷；出现外来挂载、并发锁或未处理的凭据补偿记录时停止。网页只取得受限服务身份、pepper 和会话密钥，不取得数据库或管理员密码。

## 工程和真实栈验收

```sh
npm ci --prefix web --ignore-scripts
npm run verify
node tools/verify-private-install.mjs seed acceptance
PLAYWRIGHT_BASE_URL=http://127.0.0.1:23501 NOCOBASE_URL=http://127.0.0.1:23500 node web/scripts/test-real-workspace-v1.mjs
PLAYWRIGHT_BASE_URL=http://127.0.0.1:23501 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run --prefix web test:workspace-v1-browser
node tools/private-install.mjs install acceptance
node tools/verify-private-install.mjs readback acceptance
node tools/private-install.mjs restart acceptance
node tools/verify-private-install.mjs readback acceptance
```

`seed` 只可在业务表尚为空时执行。HTTP/浏览器检查会生成虚构账号及项目；不要指向生产。Chromium 路径按本机实际安装填写。安装安全测试覆盖失败后停止和密钥保留，不等于完成灾难恢复演练。

重复安装应复用原服务凭据，原账号登录后仍能读取相同空间和项目。原始截图、trace 和实例日志可能含测试口令或邀请，不可直接公开。故障时读取错误指向的受保护日志，分享前人工复核；不转储环境或 `docker inspect`。不自动移除遗留锁，先确认安装进程已退出。

## 分发与运行边界

`release-manifest.json` 记录源版本、文件哈希及包摘要。此仓只分发应用源码、元数据、安装配方和许可/NOTICE 文本，不包含旧 Git 历史、企业资料、依赖实现、原生/WASM 二进制、浏览器或后端镜像。通用版本化 schema 与迁移保留，安装无需访问源开发仓。

配方在安装时另行取得上游软件；其原有许可、界面标识及适用条件仍须遵守。第三方许可正文保持原样，不受自有试用条款替代。若另行分发构建产物或镜像，应按实际包含的第三方字节履行相应义务。

公开运行服务仍需解决 NocoBase 托管分类/品牌义务、完整恢复验收和具体 HTTPS 环境验证。现有配方仅供隔离本机试用，不可原样暴露公网。说明书列出执行方法，不能据此推定任何检查 PASS。
