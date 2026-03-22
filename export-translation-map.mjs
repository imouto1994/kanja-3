/**
 * Export Translation Map
 *
 * Reads `merged-original.txt` and `merged-translated.txt`, parses them into
 * matching sections, and builds a JSON mapping of every unique original line
 * to its translated counterpart.
 *
 * Speech source lines (＃ in original, # in translated) and their following
 * content lines are merged into a single entry:
 *
 *   Original:  ＃咲美            →  key:   "〈咲美〉：こんちわ。"
 *              「こんちわ。」       value: "Saki: \u201CHi.\u201D"
 *
 * Narration lines are mapped directly:
 *
 *   key:   "時は過ぎ行き。"
 *   value: "Time passed on."
 *
 * Empty lines are skipped. First occurrence wins for duplicates.
 *
 * Output: `translation-map.json`
 *
 * Usage:
 *   node export-translation-map.mjs
 */

import { readFile, writeFile } from "fs/promises";

const ORIGINAL_FILE = "merged-original.txt";
const TRANSLATED_FILE = "merged-translated.txt";
const OUTPUT_FILE = "translation-map.json";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const SPEAKER_MAP = new Map([
  ["咲美", "Saki"],
  ["彦麻呂", "Hikomaro"],
  ["横山", "Yokoyama"],
  ["友子", "Tomoko"],
  ["雪菜", "Yukina"],
  ["会田", "Aida"],
  ["雅史", "Masashi"],
  ["布施", "Fuse"],
  ["珍念", "Chinnen"],
  ["黒川", "Kurokawa"],
  ["コック１", "Cook 1"],
  ["ウマ男１", "Horse Man 1"],
  ["ブタ男２", "Pig Man 2"],
  ["彼女", "Girlfriend"],
  ["慎吾", "Shingo"],
  ["鈴木", "Suzuki"],
  ["ブタ男１", "Pig Man 1"],
  ["ウマ男２", "Horse Man 2"],
  ["女店員", "Female Clerk"],
  ["兄貴", "Aniki"],
  ["ブタ男Ｘ", "Pig Man X"],
  ["ブタ男３", "Pig Man 3"],
  ["母ちゃん", "Mom"],
  ["店の人", "Shop Person"],
  ["ブタ男４", "Pig Man 4"],
  ["ブタ男５", "Pig Man 5"],
  ["見知らぬ少女", "Unknown Girl"],
  ["ブタ男６", "Pig Man 6"],
  ["エロ男Ｈ", "Perv H"],
  ["竹麻呂", "Takemaro"],
  ["コック２", "Cook 2"],
  ["化粧濃女", "Heavy Makeup Woman"],
  ["エロ男Ｅ", "Perv E"],
  ["エロ男Ｉ", "Perv I"],
  ["エロ男全員", "All Pervs"],
  ["女の子", "Girl"],
  ["エロ男Ａ", "Perv A"],
  ["エロ男Ｂ", "Perv B"],
  ["エロ男Ｃ", "Perv C"],
  ["エロ男Ｄ", "Perv D"],
  ["エロ男Ｆ", "Perv F"],
  ["エロ男Ｇ", "Perv G"],
  ["エロ男Ｊ", "Perv J"],
  ["若者", "Young Man"],
  ["受付の女性", "Receptionist"],
  ["店員", "Clerk"],
  ["男店員", "Male Clerk"],
  ["エロ男Ｋ", "Perv K"],
  ["エロ男Ｌ", "Perv L"],
  ["エロ男Ｍ", "Perv M"],
  ["エロ男Ｎ", "Perv N"],
  ["エロ男Ｏ", "Perv O"],
  ["エロ男Ｐ", "Perv P"],
  ["エロ男Ｒ", "Perv R"],
  ["エロ男Ｓ", "Perv S"],
  ["エロ男Ｔ", "Perv T"],
  ["エロ男Ｕ", "Perv U"],
  ["エロ男Ｖ", "Perv V"],
  ["エロ男Ｗ", "Perv W"],
  ["エロ男Ｘ", "Perv X"],
  ["エロ男Ｙ", "Perv Y"],
  ["エロ男Ｚ", "Perv Z"],
  ["コック３", "Cook 3"],
  ["ウマ男３", "Horse Man 3"],
  ["ウマ男４", "Horse Man 4"],
  ["男の声", "Man's Voice"],
  ["ウマ男５", "Horse Man 5"],
  ["ウマ男６", "Horse Man 6"],
  ["女性の声", "Woman's Voice"],
  ["エロ男Ｑ", "Perv Q"],
  ["女の声", "Female Voice"],
  ["運ちゃん", "Driver"],
  ["運転手", "Chauffeur"],
  ["お姉さん", "Young Lady"],
]);

/**
 * Parse a merged text file into a Map of { fileName → lines[] },
 * preserving empty lines so indices stay aligned between original and
 * translated.
 */
function parseSections(text) {
  // Step 1: Split file into raw blocks by the section separator.
  const raw = text.split(`\n${SECTION_SEPARATOR}\n`);
  const sections = new Map();

  for (const block of raw) {
    // Step 2: Locate the header separator to split filename from body.
    const headerEnd = block.indexOf(`\n${HEADER_SEPARATOR}\n`);
    if (headerEnd === -1) continue;

    const fileName = block.slice(0, headerEnd).trim();
    const body = block.slice(headerEnd + HEADER_SEPARATOR.length + 2);

    // Step 3: Keep all lines (including empty) to preserve index alignment.
    sections.set(fileName, body.split("\n"));
  }

  return sections;
}

/**
 * Strip the 「」 brackets from a Japanese speech content line.
 */
function stripBracketsJP(line) {
  if (line.startsWith("「") && line.endsWith("」")) {
    return line.slice(1, -1);
  }
  return line;
}

/**
 * Strip the \u201C\u201D quotes from an English speech content line.
 */
function stripBracketsEN(line) {
  if (line.startsWith("\u201C") && line.endsWith("\u201D")) {
    return line.slice(1, -1);
  }
  return line;
}

async function main() {
  // Step 1: Read both merged files.
  const originalText = await readFile(ORIGINAL_FILE, "utf-8");
  const translatedText = await readFile(TRANSLATED_FILE, "utf-8");

  // Step 2: Parse into section maps keyed by filename.
  const origSections = parseSections(originalText);
  const transSections = parseSections(translatedText);

  const map = new Map();
  let totalPairs = 0;
  let duplicates = 0;
  const unknownSpeakers = new Set();

  // Step 3: Walk through each section, pairing original and translated lines.
  for (const [fileName, origLines] of origSections) {
    // Skip sections without a translated counterpart.
    if (!transSections.has(fileName)) continue;
    const transLines = transSections.get(fileName);

    let i = 0;
    while (i < origLines.length && i < transLines.length) {
      const origLine = origLines[i];
      const transLine = transLines[i];

      // Step 3a: Skip empty lines.
      if (origLine.length === 0) {
        i++;
        continue;
      }

      // Step 3b: Handle speech lines (＃ source + content on next line).
      // Original uses full-width ＃, translated uses half-width #.
      if (origLine.startsWith("＃")) {
        const speakerJP = origLine.slice(1);
        const speakerEN = SPEAKER_MAP.get(speakerJP);

        if (!speakerEN) {
          unknownSpeakers.add(speakerJP);
        }

        // Merge speaker + content into a single map entry.
        if (i + 1 < origLines.length && i + 1 < transLines.length) {
          const contentOrig = origLines[i + 1];
          const contentTrans = transLines[i + 1];

          // Key uses 〈name〉：content format, stripping 「」 from original.
          const key = `〈${speakerJP}〉：${stripBracketsJP(contentOrig)}`;
          // Value uses EN name: \u201Ccontent\u201D, stripping translated quotes.
          const value = `${speakerEN || speakerJP}: \u201C${stripBracketsEN(contentTrans)}\u201D`;

          if (!map.has(key)) {
            map.set(key, value);
            totalPairs++;
          } else {
            duplicates++;
          }

          i += 2;
        } else {
          i++;
        }
        continue;
      }

      // Step 3c: Handle narration lines — map original directly to translated.
      if (!map.has(origLine)) {
        map.set(origLine, transLine);
        totalPairs++;
      } else {
        duplicates++;
      }

      i++;
    }
  }

  // Step 4: Write the translation map to disk as JSON.
  const obj = Object.fromEntries(map);
  await writeFile(OUTPUT_FILE, JSON.stringify(obj, null, 2), "utf-8");

  // Step 5: Print summary.
  console.log("— Summary —");
  console.log(`  Sections processed: ${origSections.size}`);
  console.log(`  Unique entries:     ${totalPairs}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
  console.log(`  Exported to:        ${OUTPUT_FILE}`);

  if (unknownSpeakers.size > 0) {
    console.log(
      `\n  Unknown speakers: ${[...unknownSpeakers].join(", ")}`,
    );
  }
}

main().catch(console.error);
