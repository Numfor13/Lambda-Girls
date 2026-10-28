import { createCn } from "cn/config"

/**
 * Class merger that knows our design-system type scale (src/index.css). Without this, the
 * merger reads `text-label-l` as a text colour and silently drops `text-brand-900`.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-l",
            "display-m",
            "headline-l",
            "headline-m",
            "headline-s",
            "title-l",
            "title-m",
            "body-l",
            "body-m",
            "label-l",
            "label-m",
          ],
        },
      ],
    },
  },
})
