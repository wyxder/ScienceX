# Windows 兼容环境

仅真实 Windows 加载本层。当前适配要求实际运行的 Windows x64 Node >=18（沿用仓库最低版本声明）；不通过 OS build 或系统原生架构探测推定能力，不承诺 ARM64、x86 或 WSL。当前移植依据是 Windows 工程验证交付包，尚不能宣称 Windows 10、干净安装或全部真实业务分支已验收。

只校验当前 Node 进程报告的 `platform=win32`、`arch=x64`、版本与实际可执行性；Git Bash、jq、CLI 仍各自通过实际启动和功能检查。非 x64 Node 走既有 LEGACY，系统信息查询失败不再额外阻断可运行的工具。Node 引导复用或安装 x64 Node 后也以实际启动验证为准。

Windows 原生 Node 调度明确选定的 Git for Windows Bash，原 Shell 脚本使用 Windows 原生 jq 与 alipay-cli。兼容层处理依赖、路径和进程；产品映射、CLI/MCP 命令、请求、业务确认、失败恢复和完成条件仍以真实 flow 和原脚本为准。Windows 的 Integration 继续由当前 Agent 串行执行，不启用 Worker。

## 启动与分流

Windows 首次使用时先按根 `SKILL.md` 直接探测 PATH 中的原生 Node；未找到合格 Node 才使用固定 PowerShell 引导检查其他安装位置，并在必要且获授权时有限准备。随后按根 `SKILL.md` 完成原自更新、内测声明、服务/采集选择和唯一 SESSION_ID 和本对话首次 CLI 刷新（或命中同路径/版本的成功事实）。Windows 刷新通过原生 PowerShell 完成，不依赖 Bash/jq；随后在 `runtime-entry.md` 中识别三种原根意图后、bootstrap/start-run 前执行一次：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" windows-entry --root-intent "<ROOT_INTENT>" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>"
```

用户明确要求安装并通过 Skill 完成签约/开通或完整接入时附加 `--prepare-authorized true`；仅代码开发且没有依赖准备授权时先只读检查。用户明确选择站点时附加 `--site-selected true`。准备授权只覆盖用户级依赖，不包含登录、签约或应用写入。

退出 0 只表示分流完成。必须取得唯一 `ALIPAY_AIPAY_INTERNAL:WINDOWS_ROUTE=<JSON>`，校验 schemaVersion=1、rootIntent 等于当前根意图、route 为 READY、BLOCKED、LEGACY 或 CODE_ONLY；非零、超时、缺失或冲突均按 BLOCKED 停止。READY 才执行本地快速沙箱和签约；BLOCKED 说明内部 `WINDOWS_ENV_RESULT` 的实际 reason/dependency 及恢复动作，等待环境修复，不能输出站点引导；LEGACY 仅用于不支持的执行映射或用户明确选择站点。后续 Windows runtime 命令附加当前 `--windows-route`；BLOCKED 不进入 bootstrap、业务 flow 或项目写入。CODE_ONLY 只放行独立代码开发，根意图和诊断原因沿用本次入口事实。修复可选工具后重新只读复检，取得唯一 READY 才恢复快速沙箱和开通动作。环境故障不关闭遥测，也不改变 SESSION_ID、run_id、计数或会话采集选择。

`integration_only/full_process` 遇到已识别的 Git Bash、jq、CLI 或安装辅助工具缺失/运行失败，以及这些工具的有限安装、下载、哈希/签名校验或预算耗尽失败时，返回 `CODE_ONLY`。失败工具不得继续执行，校验失败的安装包不得运行。以唯一 WINDOWS_ROUTE 的 route 决定是否进入开发；WINDOWS_ENV_RESULT 的失败诊断保留实际原因，不能将其误读为业务能力可用。该分流只允许 Integration 的原生 Node 路径，默认 `VERIFY_PENDING`，跳过快速沙箱和依赖沙箱的测试，最终如实列出未完成项，不自动引导站点开通。完整接入在代码部分检查后停在 Onboarding 前，待工具恢复且复检 READY 才恢复。Node 版本不足、实际存储故障、状态损坏、回滚失败或未知错误仍为 BLOCKED；项目路径和生产配置保护要求不变。下文“失败保持 BLOCKED”对上述可选工具例外按 CODE_ONLY 处理。

CODE_ONLY 后用户已自行修好环境时，按原根意图执行上述 `windows-entry` 只读复检；明确授权准备时附加 `--prepare-authorized true`，只有明确修复后重试才再附加 `--repair-confirmed true`，沿用原有分阶段预算。唯一 READY 才恢复快速沙箱和开通能力；仍为 CODE_ONLY 时只继续独立代码开发，不反复安装。根意图变化必须按新根意图重新执行入口，不把 CODE_ONLY 当成 LEGACY 的站点选择，也不沿用旧能力事实。

## Windows CLI 安装契约

Agent 仍只调用根启动器登记的 `env refresh-alipay-cli`。封装在独立、无 profile、非交互的系统 PowerShell 子进程中设置 `$env:ALIPAY_CLI_BIN = "$HOME\.local\bin"`、`$env:ALIPAY_CLI_SKIP_VERIFY = "true"`，执行 `irm https://opengw.alipay.com/alipaycli/install_ps1 | iex`。正式安装器按其 manifest 选择当前 release，不固定 `alipay-cli.exe` 版本；封装仅在 `$LASTEXITCODE` 非空且非零时按失败处理；空值或零仍需另用绝对路径执行已安装 EXE 的 `version`，验证失败不能报 READY。`ALIPAY_CLI_SKIP_VERIFY=true` 会跳过安装器的 SHA-256 校验，这不是文件哈希校验的替代品。

不传业务 PLATFORM/PLATFORM_ID/PRODUCT/ALIPAYCLI_BIZ_INFO，清除子进程继承的 CLI 版本、渠道、清单和跳过校验覆盖。没有 Git Bash/jq 前置，不提权、不修改系统 PATH；正式安装器会尝试把目标目录加入用户 PATH，当前父进程的 PATH 不会因子进程更新而改变。父进程 HOME/TEMP、会话与采集环境不变。

stdout 为空、原始安装器输出不对客，只映射根协议的唯一刷新终态：成功并独立启动验证通过为 READY；网络、用户目录权限分别为 RETRY_WITH_NETWORK / RETRY_WITH_LOCAL_FS_PERMISSION；校验失败为 VERIFY_FAILED；其他失败为 FAILED。沿用根协议的有限同命令重试，不在封装内部循环。安装器报权限错误也不自动提权。

## 有限环境准备

CLI 刷新策略与非 Windows 保持同一会话预算，不锁定 0.1.7 或其哈希；Windows 交由正式 PowerShell 安装器选择版本。jq 优先复用能通过版本和实际 filter 检查的既有原生工具；缺失或不可用时安装固定 1.7.1，官方 HTTPS 资产和 SHA-256 位于 `scripts/windows/policy.json`。Node 优先复用当前可运行的 Windows x64 Node >=18；缺失时由根启动器的 PowerShell 引导准备官方 LTS 用户级 ZIP，SHA-256 验证后返回绝对可执行路径，首次一次、明确修复最多一次。Git Bash 从常见目录和本机 PATH 的 Git 安装布局定位，也可由 `ALIPAY_GIT_BASH` 指定绝对路径；必须验证 Git for Windows 版本、cygpath 和 Bash 的 MINGW/MSYS 平台，不使用 System32/WSL Bash，显式指定错误时停止而不偷偷换工具。

初次缺 Git Bash、jq 或本机 CLI 无法启动且当前任务授权准备时，按 Git Bash → jq → 必要的 CLI 修复 → 完整复检执行。CLI 已可用时不重复安装。Git 优先复用已有可运行的 Git for Windows；缺失时优先调用用户级 winget，无法运行或未通过复检时使用 `scripts/windows/policy.json` 固定的 Git for Windows 官方 x64 安装包（当前 2.56.0.2）。官方包下载后先校验固定 SHA-256，再由系统 PowerShell 验证 Authenticode 有效，之后安装到 `%LOCALAPPDATA%/Programs/Git-Aipay-<version>`，并实测 git、bash、cygpath。下载或校验失败不运行安装包。两种来源均不可用时按根意图返回 CODE_ONLY 或 BLOCKED，展示原因及官方手工安装路径，不静默跳站点。

jq 使用固定 1.7.1 官方资产和 SHA-256，已有健康版本直接复用；CLI 仍使用正式 PowerShell 安装器选择当前版本。每个依赖和 Git 的两种安装来源分别记录实际开始的安装尝试，确认来源前的只读探测不消耗预算；Git 的 winget 失败可在同次准备中尝试官方固定包。初次每个来源最多一次，用户明确修复后每个来源最多再一次；失败阶段可续跑，已健康的阶段不重装。状态记录不含业务材料；复检始终只读且不消耗安装预算。可选工具的网络、签名或完整性失败按第 21 行分流；实际存储故障仍为 BLOCKED。不轮换未经验证的镜像、使用 WSL、提权或修改执行策略。

环境诊断和次数保存在 `%LOCALAPPDATA%/alipay-aipay-pre/windows/environment.json`；旧版全局次数无法归属具体安装阶段，迁移时保留阻断原因并从新版本的有限分阶段预算重新计数。锁短时占用或状态损坏时，完整工具检查通过仍可 READY；自动安装保持阻断，不删除锁或状态绕过预算。CODE_ONLY 的恢复使用第 23 行 `windows-entry`；以下仅适用于 BLOCKED。用户修好依赖后，只读复检可再次执行，无论此前安装预算是否用尽：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env retry --repair-confirmed true --root-intent "<ROOT_INTENT>" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>" --windows-route BLOCKED
```

需要再次自动安装且当前任务授权时：

```text
node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" env prepare --authorized true --repair-confirmed true --root-intent "<ROOT_INTENT>" --agent-platform "<AGENT_PLATFORM>" --session-id "<SESSION_ID>" --windows-route BLOCKED
```

如果之前只是缺少授权或没有找到安装来源，尚未实际尝试该阶段，则使用同一命令但省略 `--repair-confirmed true`，继续首次准备；不能把新授权当成已消耗预算后的额外重试许可。

仅退出 0、唯一 `CLI_ENV:READY` 和唯一根意图匹配的 `WINDOWS_ROUTE=READY` 可恢复沙箱及开通能力。BLOCKED 恢复命令的其他结果保持 BLOCKED，说明具体失败原因；不重建会话、重复计数或重放业务操作。CODE_ONLY 按第 23 行重新取得入口分流。用户明确选择站点或平台执行映射不支持时，可走原 LEGACY 分支；可恢复的依赖失败不能自动转站点。

## 路径、权限与进程

Skill 自有动作始终执行 `node "<SKILL_DIR>/references/normal/scripts/runtime.mjs" ...`；不要把 Bash 脚本、环境变量赋值或 Unix 管道贴到 PowerShell。命令中的值占位符由 Agent 替换，JSON 通过宿主参数数组传递或按当前 shell 正确引用；不要把 `$RUN_ID` 等说明占位符当作已存在的 PowerShell 变量。

只转换登记的项目、配置、上传文件和脚本路径；JSON、URL、scope、公钥和业务上下文保持原样。禁用 MSYS 隐式参数转换后，适配器显式转换 `git -C` 和 native Node/jq/CLI 文件参数。快速沙箱终态的路径由 gateway 归一化为原生盘符绝对路径，脚本内部比较不变。

大 jq `--argjson` 值使用当前动作的临时文件并在调用后删除，MCC 目录使用 Node stdin，原 CLI 的 `-d/--data` 不改写；超出原生进程参数预算时明确失败，不能换未经确认的 CLI 参数。同步/异步 Shell 执行共享同一 Git Bash 适配器；CLI 最多 60 秒、业务 Shell 最多 180 秒，超时不等于未发送或业务成功，仍按原只读核验/UNKNOWN 规则处理。

Windows 沙箱项目配置不要求精确 NTFS ACL 白名单；项目可继承宿主或 Agent 正常工作所需的权限。环境状态、Shell 临时目录、CLI 凭据和日志目录的 ACL 不作为入口门禁。进入登录、签约等需用 CLI 登录凭据的动作前，才验证 `~/.alipay-cli/credentials` 实际可写；失败仅阻断依赖登录凭据的动作，不阻断沙箱和项目代码开发。授权状态和公钥页状态文件只检查实际可写性与非符号链接路径，不改写继承权限；这不表示 ACL 已安全配置，密钥文件访问控制由部署环境管理。生产配置仍遵守各自脚本的保护规则。

Shell 业务子进程的临时文件放在上述环境目录的专用 tmp 中；gateway 本身不切换 TEMP/TMP，不改变现有遥测目录。Shell 子进程用原 `telemetryStoragePaths()` 明确绑定原来的遥测目录及既有覆盖项，保证声明选择、会话、run、outbox 和上传状态连续。遥测文件的权限失败沿用原静默失败语义，业务计数、采集及上传逻辑不变。

402 联调仍由原生 Python 3 执行，不依赖 Git Bash。其 Node 启动器在系统临时目录下创建本次命令的独立空目录，确认实际可写后才启动 Python；仅该子进程的 TEMP/TMP/TMPDIR 与 Python `tempfile.tempdir` 指向此目录，禁止不可用时回退到其他目录。过程产物及 curl 响应文件继承用户现有目录权限；实际写入失败时不伪报 ACL 问题。子进程结束或启动异常后尽力清理本次目录，清理失败只输出内部诊断且不覆盖原始执行结果，不重放请求。父进程环境、原 Python 业务脚本、参数和退出码不变；强制终止父进程可能留下该目录，不作为恢复依据。

Windows 签约请求的 UUID 使用已有 Node 生成，仅此步骤不要求 python3/uuidgen；Unix/macOS/Linux 保留原依赖检查与生成方式。402 联调仍需 Python 3，此项依赖未被取消。

## 失败处理

所有兼容层内部 marker 只写 stderr 且以 `ALIPAY_AIPAY_INTERNAL:` 开头，不对客。`WINDOWS_ENV_RESULT` 表示环境诊断；`WINDOWS_BUSINESS_BLOCKED=ENVIRONMENT_UNAVAILABLE` 表示 gateway 在启动本次业务脚本前阻断，退出非零，本次业务 CLI 调用为零。

Integration 在上述明确的调用前阻断时停在环境恢复点，不擅自改判 LEGACY/CODE_ONLY；本例外仅处理根入口的可选工具失败。用户修复后复检 READY 才继续；沙箱脚本已经启动后，只接受原 flow 的 READY、CREATE_PENDING、VERIFY_PENDING 和精确 LOCAL_FS_RECOVERY；非零、超时、协议冲突仍停止核对，不将异常伪装成待配置、不重放原 MCP、不读取敏感配置补造成功证据。

Onboarding 的环境失败停止依赖动作；修复后先按原只读入口查询实际状态。授权、材料、资格和审核错误仍归原业务分支，不能统一解释为 Windows 失败。所有原有交付屏障、阻塞确认、未知写结果规则和最终收口仍有效。

## 402 的 Python 依赖

仅按量付费联调前由真实 Integration flow 登记的 `env check-python` / `env prepare-python` 准备。优先复用 `py -3`、`python`、`python3` 和常见用户/系统 Python 安装；以实际 Python 3、Windows 平台及当前脚本无 main 加载验证可用性，取得绝对解释器路径供同一启动器使用。缺失且已获依赖准备授权时只调用 winget 官方源的 `Python.Python.3.14` 用户级 x64 安装，超时 180 秒，随后重新发现并验证。winget 包的用户安装条目与官方 python.org 产物已只读核验；具体安装器按其既有行为可能更新用户 PATH，不修改系统 PATH、不主动提权。

Python 安装次数保存在独立 `python-environment.json`，首次一次、明确修复最多一次；不消耗或重置 Git/jq/CLI 预算、不影响遥测状态。安装失败不启动联调，不自动尝试其他来源；网站支付、APP 支付及单独开通不准备 Python。正式版依赖策略保持原样。

Windows Node 自动准备与目录占用恢复以根启动器为准：Node 保留现有安装，官方文件仅对临时网络失败最多请求两次；首次 prepare 一次、用户明确修复后 repair 一次，校验失败不循环。目录替换前受阻时可加载经完整校验的当前会话副本，明确全局未更新，后续统一入口全部绑定新路径；不复用旧路径的声明确认或 CLI 刷新事实。
