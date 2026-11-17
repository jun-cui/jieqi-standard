# 2. Glossary

These are the terms used in the specifications, the schemas, the field names and messages, and the reference implementation. Contributions should use them as well.

The English follows current usage for Xiangqi and Jieqi, in American spelling. A few ideas have no settled English name, and the terms for them were chosen for this standard: role, pool, view, sealed shuffle, capture disclosure, host, move code, expected score, reveal breakdown and tree count. The Chinese given for those is a plain description rather than an established term.

## 2.1 The game and the sides

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| Jieqi | 揭棋 | jiēqí | The game defined in [spec 1](01-rules.md). |
| Xiangqi | 象棋 | xiàngqí | The game Jieqi is based on. |
| Red | 红方 | hóngfāng | The side that moves first. Written in uppercase. |
| Black | 黑方 | hēifāng | The side that moves second. Written in lowercase. |
| side to move | 行棋方 | xíngqífāng | The side whose turn it is. |
| ruleset | 规则 | guīzé | A named set of rules, such as `jieqi`. |

## 2.2 The board

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| point | 交叉点 | jiāochādiǎn | One of the 90 intersections where pieces stand. |
| column | 纵线 | zòngxiàn | A vertical line, `a` to `i` from Red's left. |
| row | 横线 | héngxiàn | A horizontal line, `0` to `9` from Red's baseline. |
| line number | 路 | lù | The traditional number of a column, 1 to 9, counted from each player's own right ([spec 4](04-moves.md#5-traditional-notation)). |
| river | 河界 | héjiè | The gap between rows 4 and 5. |
| own side, far side | 己方, 对方 | jǐfāng, duìfāng | A side's own half of the board, and the opponent's half. |
| cross the river | 过河 | guòhé | To be on the far side. |
| palace | 九宫 | jiǔgōng | The 3 × 3 area around each General's starting point. |
| baseline | 底线 | dǐxiàn | Row 0 for Red, row 9 for Black. |

## 2.3 Pieces

| Term | Chinese (Red / Black) | Pinyin | Letter |
|---|---|---|---|
| General | 帅 / 将 | shuài / jiàng | G |
| Advisor | 仕 / 士 | shì | A |
| Elephant | 相 / 象 | xiàng | E |
| Horse | 马 | mǎ | H |
| Chariot | 车 | jū | R |
| Cannon | 炮 | pào | C |
| Soldier | 兵 / 卒 | bīng / zú | S |

## 2.4 Hidden pieces

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| dark piece | 暗子 | ànzǐ | A face-down piece. Written `X` for Red and `x` for Black. |
| revealed piece | 明子 | míngzǐ | A face-up piece. |
| reveal | 揭, 翻 | jiē, fān | Turning a dark piece face up at the end of its move. This standard always says "reveal", never "flip". |
| identity | 身份 | shēnfèn | What a piece really is. |
| role | 原位兵种 | yuánwèi bīngzhǒng | The piece type that belongs to a starting point. A dark piece moves in role. |
| starting point | 原位 | yuánwèi | One of the 16 points per side where pieces start. |
| shuffle | 洗子 | xǐzǐ | Placing the 15 dark pieces of each side at random. |
| layout | 布子 | bùzǐ | One particular result of the shuffle ([spec 6](06-shuffle.md)). |
| sealed shuffle | 封存布子 | fēngcún bùzǐ | A layout the arbiter has committed to with a hash before the game. |
| pool | 未知子池 | wèizhī zǐchí | The identities of one side that a given party cannot yet account for ([spec 8](08-probability.md)). |
| capture disclosure | 吃暗子知情 | chī ànzǐ zhīqíng | Telling the capturer, and only the capturer, what a captured dark piece was (rule 5.3). |
| view | 视角 | shìjiǎo | What one party knows: `arbiter`, `red`, `black` or `public` ([spec 5](05-record.md#4-views)). |
| arbiter | 裁判 | cáipàn | Whoever holds the layout and applies the rules. |

## 2.5 Moves

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| move | 着, 步 | zhāo, bù | One turn by one side. |
| round | 回合 | huíhé | A move by Red and Black's reply. |
| advance, retreat, traverse | 进, 退, 平 | jìn, tuì, píng | Forward, backward and sideways, as used in traditional notation. |
| front, middle, rear | 前, 中, 后 | qián, zhōng, hòu | Words used to tell apart pieces on the same column. |
| screen | 炮架 | pàojià | The piece a Cannon jumps over to capture. |
| horse's leg | 马腿 | mǎtuǐ | The point next to a Horse that must be empty for it to move that way. |
| hobbled horse | 蹩马腿 | bié mǎtuǐ | A Horse whose leg is blocked. |
| elephant's eye | 象眼 | xiàngyǎn | The point in the middle of an Elephant's move. |
| blocked eye | 塞象眼 | sāi xiàngyǎn | An elephant's eye that is occupied. |
| capture | 吃子 | chīzǐ | Moving onto an opposing piece and removing it. |

## 2.6 Attack, end of the game, results

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| jiang | 将, 将军 | jiāng, jiāngjūn | An attack on the General. "Red gives jiang", "Black is under jiang". |
| facing Generals | 将帅对面 | jiàng shuài duìmiàn | The Generals on the same column with nothing between them, which is not allowed. |
| kill | 将死, 杀 | jiāngsǐ, shā | Being under jiang with no legal move, which loses. In analysis also a forced sequence that ends this way. |
| trap | 困毙 | kùnbì | Having no legal move without being under jiang, which also loses. |
| chase | 捉 | zhuō | A move that creates a new threat against a piece, as defined in rule 9.5. |
| idle move | 闲着 | xiánzhāo | A move that is neither a jiang nor a chase. |
| perpetual jiang | 长将 | chángjiāng | Giving jiang with every move of a repetition span. |
| perpetual chase | 长捉 | chángzhuō | Giving jiang or chasing with every move of a span, with at least one chase. |
| natural move limit | 自然限着 | zìrán xiànzhāo | The draw after 120 moves without a capture or reveal. |
| bare Generals | 双方仅剩将帅 | shuāngfāng jǐn shèng jiàng shuài | Only the two Generals are left. |
| resignation | 认输 | rènshū | Giving up the game. |
| agreed draw | 议和 | yìhé | A draw both players agree to. |
| draw | 和棋 | héqí | A game nobody wins. |
| loss on time | 超时判负 | chāoshí pànfù | Losing because the clock ran out. |
| forfeit | 判负 | pànfù | A loss declared by the arbiter. |

## 2.7 Records and software

| Term | Chinese | Pinyin | Meaning |
|---|---|---|---|
| game record | 棋谱 | qípǔ | A full account of a game. The file format is JGR ([spec 5](05-record.md)). |
| position | 局面 | júmiàn | Everything needed to continue a game. The text format is JPS ([spec 3](03-position.md)). |
| move code | 着法码 | zhāofǎ mǎ | How a move is written for programs, for example `h2e2=R` ([spec 4](04-moves.md)). |
| traditional notation | 记谱法 | jìpǔfǎ | How a move is written for people, for example 炮二平五 or `C2.5`. |
| engine | 引擎 | yǐnqíng | A program that analyzes positions and chooses moves. |
| host | 主控程序 | zhǔkòng chéngxù | The program that runs an engine: a GUI, a match runner or a server ([spec 7](07-engine-protocol.md)). |
| expected score | 期望得分 | qīwàng défēn | Win 1, draw ½, loss 0, averaged over chance and over the play that follows. |
| candidate move | 候选着 | hòuxuǎn zhāo | A move the engine reports on separately. |
| main line | 主变 | zhǔbiàn | The sequence of moves the engine expects. |
| reveal breakdown | 揭子分布 | jiēzǐ fēnbù | An engine's evaluation of a move, given separately for each identity the moving piece could turn out to have. |
| tree count | 着法树计数 | zhāofǎshù jìshù | The number of sequences of moves and outcomes of a given length, used to test move generators ([spec 8](08-probability.md#5-tree-counts)). |
| opening library | 开局库 | kāijú kù | A stored collection of opening moves. |
| endgame database | 残局库 | cánjú kù | A stored collection of solved endings. |

## 2.8 Words that are not used

Some terms from other board games mean something slightly different in Jieqi, or nothing at all. They are not used in this standard, in field names or in messages. Use the term on the right instead.

| Not used | Use instead |
|---|---|
| king, rook, bishop, knight, pawn | General, Chariot, Elephant, Horse, Soldier |
| queen | (Jieqi has no such piece) |
| check, in check | jiang, under jiang |
| checkmate, mate | kill |
| stalemate | trap (a loss in Jieqi, not a draw) |
| perpetual check | perpetual jiang |
| square | point |
| file, rank | column, row |
| white | Red |
| ply, half-move | move |
| move number, full move | round |
| centipawn, pawn units | expected score |
| principal variation, PV | main line |
| perft | tree count |
| promotion, castling, en passant | (these do not exist in Jieqi) |
| flip | reveal |
| FEN, PGN, UCI | JPS, JGR, JEP |

## 2.9 Spelling and style

- American spelling: color, center, analyze, behavior.
- Piece names are capitalized when they name a type of piece: "the Cannon", "two Soldiers". "Dark piece" and "revealed piece" are not.
- "Red" and "Black" are capitalized when they name a side.
- The first time a term appears in a document, its Chinese is given in parentheses: "a dark piece (暗子)".
