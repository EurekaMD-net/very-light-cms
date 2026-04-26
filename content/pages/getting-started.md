---
title: Getting Started
slug: getting-started
date: "2026-04-26"
description: How to run Very Light CMS locally and deploy it.
tags:
  - setup
  - guide
draft: false
---

## Prerequisites

- Node.js 20+
- SQLite (bundled via `better-sqlite3`, no install needed)

## Local Setup

```bash
git clone https://github.com/EurekaMD-net/very-light-cms.git
cd very-light-cms
npm install
cp env.example .env
npm run dev
```

The server starts on `http://localhost:3000`.

## Adding Content

Drop a `.md` file into `content/pages/`. It becomes available at `/:slug` immediately.

Frontmatter fields:

| Field         | Required | Description                     |
|---------------|----------|---------------------------------|
| `title`       | ✅       | Page title                      |
| `slug`        | No       | URL slug (defaults to filename) |
| `date`        | No       | ISO 8601 date string            |
| `description` | No       | Meta description                |
| `draft`       | No       | `true` hides from public routes |
| `tags`        | No       | Array of strings                |
