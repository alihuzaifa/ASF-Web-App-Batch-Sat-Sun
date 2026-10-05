# LinkedIn skills

Eleven Claude Code skills for running your LinkedIn account: posts, comments, replies to comments,
profile score, weekly plan, carousels, repurposing, connection notes and DMs, inbox triage, post
audits, and a humanizer that removes AI tells from a draft before you see it.

They are from [Jakeschincariol/linkedin-agent-skill](https://github.com/Jakeschincariol/linkedin-agent-skill)
(MIT, see `LICENSE`), copied at commit `add2c23` with two small changes:

- `li-human/humanize.py`: a deleted phrase after an em dash no longer leaves `tools,.` behind.
- `li-human/SKILL.md`: says to use `python` on Windows, where `python3` opens the Microsoft Store.

**They write, you post.** None of these skills posts, comments or sends messages for you, on purpose:
LinkedIn has no API for that on a personal profile, and doing it with a bot breaks LinkedIn's user
agreement and gets accounts restricted. Each skill ends with a copy-ready block that you paste yourself.

## Install

From the job-finder folder:

```
npm run install-skills
```

This copies the eleven `li-*` folders into `~/.claude/skills/` and puts a blank voice profile at
`~/.claude/linkedin/voice.md` (an existing one is never overwritten). Restart Claude Code afterwards.

Then fill in `~/.claude/linkedin/voice.md`, or paste three of your own posts into Claude and say
"write my voice.md from these". Every skill reads it; without it everything sounds generic.

The humanizer needs Python 3 (no packages). Everything else needs only Claude Code.

## Commands

| command | what it does |
| --- | --- |
| `/li-post` | one idea into a post: three hook options and one full draft, humanized |
| `/li-comment` | a comment on someone else's post that says something real |
| `/li-reply` | replies to the comments under your own post, most important first |
| `/li-profile` | scores your profile out of 100 and rewrites the weak parts |
| `/li-plan` | the week: what to post, when, and 10 people to engage with |
| `/li-human` | cleans a draft and scores how human it reads (two local Python scripts) |
| `/li-carousel` | slide-by-slide copy for a document post |
| `/li-repurpose` | one video, newsletter or transcript into a week of posts |
| `/li-dm` | connection note, first message and two follow-ups |
| `/li-inbox` | sorts pasted messages into lead / recruiter / peer / ask / spam |
| `/li-audit` | what worked in your past posts and what to stop |
