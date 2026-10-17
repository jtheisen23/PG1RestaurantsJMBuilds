# Brand logos

Drop an image in here named after the brand's key and it appears on the
brand picker and on every project page for that brand. Nothing else to
change -- the app picks up whatever is in this folder at build time.

| File name              | Brand              |
| ---------------------- | ------------------ |
| `jerseymikes.*`        | Jersey Mike's      |
| `daves.*`              | Dave's Hot Chicken |
| `mogu.*`               | Mogu               |
| `doghaus.*`            | Dog Haus           |
| `jmacquisitions.*`     | optional -- falls back to the Jersey Mike's logo |

`.svg`, `.png`, `.jpg` and `.webp` all work. SVG is best; otherwise a PNG
around 256px or larger. A transparent background is fine: logos sit on a
white plate so a dark wordmark stays readable in dark mode.

Any brand without a file here keeps its coloured initials, so a missing
logo looks deliberate rather than broken.
