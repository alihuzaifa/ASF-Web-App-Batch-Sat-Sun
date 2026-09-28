---
description: Render a dark blue LinkedIn image still for Huzaifa Usman on a given topic (square or portrait, ultra-HD 4x) plus a first-person LinkedIn caption.
argument-hint: "<topic>"
---

# /image

Make one image still about **$ARGUMENTS** and write the caption that goes with it.

The template lives in `${CLAUDE_PLUGIN_ROOT}/assets/remotion-template`. Everything
renders on this machine; nothing is uploaded and nothing is posted.

## Steps

1. **Read the facts first.** `src/brand.profile.json` is the only source for
   anything the card claims about him. If the topic needs a fact that is not in
   there, ask him for it — do not fill the gap.

2. **Pick the card.** `insight` for a thought with a short body, `list` for 3-5
   checks, `stat` for one number, `quote` for a point of view, `showcase` for one
   of his repositories. Square unless he asks for portrait (portrait takes more of the LinkedIn feed).

3. **Write the copy** in his voice: first person, plain, short sentences, no
   hype and no emoji. The headline carries the idea; `keyPhrase` must be a
   substring of it and is the part that gets the gradient.

4. **Save the props** to `props.json` in the template folder, then check them:

   ```bash
   node scripts/validate-props.mjs props.json
   ```

   Fix whatever it reports. It catches the mistakes that waste a render.

5. **Render** at 4x:

   ```bash
   npx remotion still src/index.ts Image out/image.png --scale=4 --props=./props.json
   node scripts/verify.mjs image out/image.png
   ```

   `verify` reads the file that was written. Do not report a card as done
   without it.

6. **Deliver.** Copy it to `<project-root>/output/`, and write a first-person
   caption next to it as `<name>.caption.md`: two or three short lines that say
   the same thing the card says, plus a question he can actually answer in the
   replies. No hashtag wall — two at most.

Tell him the file path and what the card says. Do not post anything anywhere.
