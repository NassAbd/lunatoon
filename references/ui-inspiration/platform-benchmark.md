# Platform benchmark — POC 06

Checked 2026-10-24. Research informs hierarchy; it does not supply shipped artwork or branding.

| Source | Observed pattern | Lunatoon application |
| --- | --- | --- |
| [WEBTOON home](https://www.webtoons.com/en) | Named discovery sections, series titles and genre categories make browsing understandable. | A small cover-led library, one featured playable story and one explicitly upcoming concept. No fabricated popularity or catalogue size. |
| [WEBTOON CANVAS](https://www.webtoons.com/en/canvas/) | Independent series pair artwork with title, genre and concise metadata. | Original covers with clear genre and availability, without creator/social metrics the local app cannot substantiate. |
| [Creator Academy resources](https://www.webtoons.com/en/creators101/webtoon-academy/resource-list?resourceType=DOWNLOAD_RESOURCE) | Provides a character sheet, design sheet and creator handbook. | Preserve the existing Kael bible and a consistent visual palette. |
| [Character sheet](https://webtoons-static.pstatic.net/creator101/en/pdf/Character-Sheet-2024.pdf?dt=2024011001) | Motivations and conflicting wants/needs support meaningful character choices. | Keep Kael's existing detective motivation; do not change the working narrative engine for a UI iteration. |
| [Character design sheet](https://webtoons-static.pstatic.net/creator101/en/pdf/Character-Design-Sheet.pdf?dt=2024011001) | Full-body, expressions and palette references support consistency. | Reuse original Lunatoon shapes and colors in authored opening panels. |
| [Lunatoon baseline](https://github.com/NassAbd/lunatoon/tree/fix/narrative-robustness) | Local code and synchronized POC 05.1 are the implementation authority. | Preserve stable run URLs, reference edits, two decisions and saved content. |

The [creator handbook PDF](https://webtoons-static.pstatic.net/creator101/en/pdf/Creators-Resource-Handbook-Updated.pdf?dt=2024011001) could not be fetched by the research tool: its 16,999,080-byte response exceeded the tool limit. No claims about its unseen content are made.

Lunatoon intentionally has no accounts, rankings, comments, subscriptions or public sharing. Its saved-session list is for one local installation. The library must not imply a multi-user service.

## Asset and copyright notes

No WEBTOON artwork, screenshots, logos, characters or templates are bundled. The existing `public/neon-protocol.svg` and Kael reference remain original Lunatoon assets. New vector compositions and the preview concept are authored in this repository, without paid generation. Generated private story images remain under ignored `data/`; they are not promoted to public covers. Research screenshots are not shipped.
