# 规则库

版本化存放 TAG / IGETC / 专业先修规则。目录结构：

```
rules/
  2026-27/
    tag/
      uc-davis.yaml
      uc-irvine.yaml
      uc-merced.yaml
      uc-riverside.yaml
      uc-san-diego.yaml
      uc-santa-cruz.yaml
    igetc.yaml
    majors/
      cs.yaml            # 以 CS 为例，各专业先修要求
```

## 规则文件格式（约定）

每条规则必须可追溯：`source` 字段注明官方出处 URL，`verified_date` 注明核验日期。

```yaml
school: UC Irvine
program: TAG
academic_year: 2026-27
source: https://www.admissions.uci.edu/apply/transfer/guarantee.php
verified_date: 2026-10-15
requirements:
  min_gpa: 3.4
  min_units: 30
  ...
```

## 贡献规则变更

每年 8–9 月各校发布新学年 TAG 细则，欢迎提交 PR 更新。PR 必须附官方来源链接。
