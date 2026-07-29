# MinerU Document Extractor

> PDF/图片/网页转 Markdown/LaTeX/DOCX 的 CLI 工具，支持 flash-extract（免 token 快速提取）和 precision-extract（精确提取）。

## Overview

MinerU Document Extractor 是 MinerU API 的 CLI 封装，提供三种命令：flash-extract（免 token 快速提取）、extract（精确提取含表格/公式识别）、crawl（网页提取）。支持 20+ 语言，批量处理，多种输出格式。

**目标用户：** 需要将 PDF/图片/网页转换为结构化文本的研究者。

## Directory Structure

```
MinerU-Document-Extractor/
├── SKILL.md          # 完整技能文档（379 行）
├── _meta.json        # 包元数据
└── CONTRIBUTING.md   # 贡献指南
```

## Core Capabilities

### 两种提取模式对比

| 特性 | flash-extract | extract |
|------|--------------|---------|
| 需要 Token | 否 | 是 |
| 速度 | 快 | 正常 |
| 表格识别 | 否 | 是 |
| 公式识别 | 否 | 是 |
| 输出格式 | 仅 Markdown | md, html, latex, docx, json |
| 批量模式 | 否 | 是 |
| 文件大小限制 | **10 MB** | 更高 |
| 页数限制 | **20 页** | 更高 |

### 三种命令

#### 1. flash-extract（免 token）

```bash
mineru-open-api flash-extract report.pdf                    # Markdown 输出到 stdout
mineru-open-api flash-extract report.pdf -o ./out/          # 保存到文件
mineru-open-api flash-extract https://example.com/doc.pdf   # URL 模式
mineru-open-api flash-extract report.pdf --language en      # 指定语言
mineru-open-api flash-extract report.pdf --pages 1-10       # 页码范围
```

#### 2. extract（需要 token）

```bash
mineru-open-api extract report.pdf                         # Markdown 输出
mineru-open-api extract report.pdf -f html                 # HTML 输出
mineru-open-api extract report.pdf -o ./out/               # 保存到目录
mineru-open-api extract report.pdf -o ./out/ -f md,docx    # 多格式输出
mineru-open-api extract *.pdf -o ./results/                # 批量提取
mineru-open-api extract --list files.txt -o ./results/     # 从文件列表批量
mineru-open-api extract https://example.com/doc.pdf        # URL 提取
cat doc.pdf | mineru-open-api extract --stdin -o ./out/    # stdin 输入
```

#### 3. crawl（需要 token）

```bash
mineru-open-api crawl https://example.com/article              # Markdown 输出
mineru-open-api crawl https://example.com/article -f html      # HTML 输出
mineru-open-api crawl url1 url2 -o ./pages/                    # 批量爬取
```

### 模型对比

| 模型 | 准确性 | 幻觉风险 | 最佳用途 |
|------|--------|----------|----------|
| `vlm` | 更高 | 罕见情况下可能幻觉 | 学术论文、复杂布局 |
| `pipeline` | 标准 | **零幻觉** | 需要保真度的场景 |

### 支持语言

- 独立语言包：`ch`（中英，默认）, `en`, `japan`, `korean`, `chinese_cht`, `ta`, `te`, `ka`, `el`, `th`
- 语言族包：`latin`（40+ 语言）, `arabic`, `cyrillic`, `east_slavic`, `devanagari`

### 支持输入格式

PDF, Images (png/jpg/jpeg/jp2/webp/gif/bmp), Word (.docx, .doc), PowerPoint (.pptx, .ppt), HTML, URLs

## Key Workflows

### 安装

```bash
npm install -g mineru-open-api
# 或通过 Go：
go install github.com/opendatalab/MinerU-Ecosystem/cli/mineru-open-api@latest
```

### Token 管理

```bash
mineru-open-api auth              # 交互式 token 设置
mineru-open-api auth --verify     # 验证当前 token
mineru-open-api auth --show       # 显示当前 token 来源
```

**Token 解析顺序：** `--token` 标志 > `MINERU_TOKEN` 环境变量 > `~/.mineru/config.yaml`

### 默认输出目录

未指定 `-o` 时，输出到 `~/MinerU-Skill/<name>_<hash>/`，其中 `<hash>` 是源路径/URL 的 MD5 前 6 位。

## Configuration & Dependencies

**必需：** `mineru-open-api` CLI（npm 或 Go 安装）

**Token：** flash-extract 免 token；extract 和 crawl 需要 token（从 mineru.net 获取）

**限制：**
- flash-extract：10 MB / 20 页限制，IP 限速
- 二进制格式（docx）不能输出到 stdout，必须用 `-o`

## Exit Codes

| 代码 | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 通用 API 错误 |
| 2 | 无效参数 |
| 4 | 文件过大/页数超限 |
| 5 | 提取失败 |
| 6 | 超时 |

## Limitations & Notes

- flash-extract 有 10 MB / 20 页限制和 IP 限速
- VLM 模型可能罕见幻觉；pipeline 模型零幻觉但复杂布局准确性较低
- Token 从 mineru.net 单独获取
- 超时默认 900 秒
