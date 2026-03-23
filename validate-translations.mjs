/**
 * Validate Translations (chunk-based)
 *
 * Compares translated chunks in `translated-merged-chunks/` against original
 * chunks in `original-merged-chunks/` to ensure structural consistency.
 *
 * Checks performed per section:
 *   1. Every original section has a matching translated section (by filename).
 *   2. Non-empty line counts match.
 *   3. Line types match (source / speech / normal).
 *   4. Speech source names match via SPEAKER_MAP (JP → EN).
 *
 * Errors are collected and printed in reverse order so the first mismatch
 * appears at the bottom of the terminal (most visible).
 *
 * Usage:
 *   node validate-translations.mjs
 */

import { readFile } from "fs/promises";
import { glob } from "glob";

const ORIGINAL_CHUNKS_DIR = "original-merged-chunks";
const TRANSLATED_CHUNKS_DIR = "translated-merged-chunks";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

/**
 * Classify a line into a structural type with bracket-specific subtypes:
 *   "source"         — speaker name (＃ in original, $ in translated)
 *   "speech-quote"   — quoted speech (「」 / \u201C\u201D / "")
 *   "speech-paren"   — thought/parenthetical (（） / ())
 *   "speech-bracket" — emphasis (【】 / [])
 *   "normal"         — narration / everything else
 */
function lineType(line, isTranslated) {
  if (isTranslated ? line.startsWith("$") : line.startsWith("＃"))
    return "source";

  if (isTranslated) {
    if (line.startsWith("\u201C") && line.endsWith("\u201D")) return "speech-quote";
    if (line.startsWith('"') && line.endsWith('"')) return "speech-quote";
    if (line.startsWith("(") && line.endsWith(")")) return "speech-paren";
    if (line.startsWith("[") && line.endsWith("]")) return "speech-bracket";
  } else {
    if (line.startsWith("「") && line.endsWith("」")) return "speech-quote";
    if (line.startsWith("『") && line.endsWith("』")) return "speech-quote";
    if (line.startsWith("（") && line.endsWith("）")) return "speech-paren";
    if (line.startsWith("【") && line.endsWith("】")) return "speech-bracket";
  }

  return "normal";
}

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
 * Parse all chunk files in a directory into a Map of
 * { fileName → { lines, chunkPath, startLine } }.
 */
async function parseSectionsFromChunks(dir) {
  const chunkFiles = (await glob(`${dir}/part-*.txt`)).sort();
  const sections = new Map();

  for (const chunkPath of chunkFiles) {
    const text = await readFile(chunkPath, "utf-8");
    const allLines = text.split("\n");

    let i = 0;
    while (i < allLines.length) {
      // Scan for the next section separator.
      if (allLines[i] !== SECTION_SEPARATOR) { i++; continue; }

      const sectionStartLine = i + 1; // 1-indexed
      i++; // skip separator
      if (i >= allLines.length) break;

      const fileName = allLines[i].trim();
      i++; // skip filename
      if (i >= allLines.length || allLines[i] !== HEADER_SEPARATOR) continue;
      i++; // skip header separator

      // Collect non-empty content lines and their 1-indexed chunk line numbers.
      const contentLines = [];
      const contentLineNos = [];
      while (i < allLines.length && allLines[i] !== SECTION_SEPARATOR) {
        if (allLines[i].length > 0) {
          contentLines.push(allLines[i]);
          contentLineNos.push(i + 1);
        }
        i++;
      }

      sections.set(fileName, {
        lines: contentLines,
        lineNos: contentLineNos,
        chunkPath,
        startLine: sectionStartLine,
      });
    }
  }

  return sections;
}

async function main() {
  // Step 1: Parse sections from both chunk directories.
  const origSections = await parseSectionsFromChunks(ORIGINAL_CHUNKS_DIR);
  const transSections = await parseSectionsFromChunks(TRANSLATED_CHUNKS_DIR);

  let checked = 0;
  let mismatched = 0;
  const errors = [];

  // Step 2: Validate each original section against its translated counterpart.
  for (const [fileName, origEntry] of origSections) {
    const { lines: origLines, lineNos: origLineNos, chunkPath: origChunk, startLine: origStart } = origEntry;

    // Step 2a: Check that the translated chunks have a matching section.
    if (!transSections.has(fileName)) {
      mismatched++;
      errors.push({
        header: `✗  ${origChunk}:${origStart} > ${fileName}`,
        details: ["   Missing from translated chunks"],
      });
      continue;
    }

    checked++;
    const transEntry = transSections.get(fileName);
    const { lines: transLines, lineNos: transLineNos, chunkPath: transChunk, startLine: transStart } = transEntry;
    const sectionErrors = [];
    let firstErrorLineIdx = -1;

    if (origLines.length !== transLines.length) {
      // Step 2b: Non-empty line counts must match.
      sectionErrors.push(
        `Line count mismatch: original has ${origLines.length} lines, translated has ${transLines.length} lines`,
      );

      const minLen = Math.min(origLines.length, transLines.length);
      for (let i = 0; i < minLen; i++) {
        const origType = lineType(origLines[i], false);
        const transType = lineType(transLines[i], true);
        if (origType !== transType) {
          if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
          sectionErrors.push(
            `First type mismatch at line ${i + 1} (${origType} vs. ${transType}):\n     original:   ${origLines[i]}\n     translated: ${transLines[i]}`,
          );
          break;
        }
      }
    } else {
      // Step 2c: Line-by-line structural comparison.
      for (let i = 0; i < origLines.length; i++) {
        const origLine = origLines[i];
        const transLine = transLines[i];
        const origType = lineType(origLine, false);
        const transType = lineType(transLine, true);

        if (origType !== transType) {
          if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
          sectionErrors.push(
            `Line ${i + 1}: type mismatch (${origType} vs. ${transType})\n     original:   ${origLine}\n     translated: ${transLine}`,
          );
          break;
        } else if (origType === "source") {
          const origName = origLine.slice(1);
          const transName = transLine.slice(1);
          const expectedEN = SPEAKER_MAP.get(origName);

          if (!expectedEN) {
            if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
            sectionErrors.push(
              `Line ${i + 1}: unknown speaker "${origName}" — add to SPEAKER_MAP`,
            );
          } else if (transName !== expectedEN) {
            if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
            sectionErrors.push(
              `Line ${i + 1}: speaker name mismatch\n     expected: $${expectedEN}\n     got:      ${transLine}`,
            );
          }
        }
      }
    }

    if (sectionErrors.length > 0) {
      mismatched++;
      const origErrLine = firstErrorLineIdx >= 0 && origLineNos[firstErrorLineIdx]
        ? origLineNos[firstErrorLineIdx] : origStart;
      const transErrLine = firstErrorLineIdx >= 0 && transLineNos[firstErrorLineIdx]
        ? transLineNos[firstErrorLineIdx] : transStart;
      errors.push({
        header: `✗  ${origChunk}:${origErrLine} | ${transChunk}:${transErrLine} > ${fileName}`,
        details: sectionErrors.map((e) => `   ${e}`),
      });
    }
  }

  // Step 3: Warn about extra sections in translated that have no original.
  const extraInTranslated = [...transSections.keys()].filter(
    (f) => !origSections.has(f),
  );
  if (extraInTranslated.length > 0) {
    const details = extraInTranslated.map((f) => {
      const entry = transSections.get(f);
      return `   ${entry.chunkPath}:${entry.startLine} > ${f}`;
    });
    errors.push({
      header: "⚠  Extra sections in translated chunks not in original:",
      details,
    });
  }

  // Step 4: Print errors in reverse order (first mismatch at bottom).
  if (errors.length > 0) {
    console.log("\n--- Errors (first mismatch at bottom) ---");
    for (let i = errors.length - 1; i >= 0; i--) {
      console.log(`\n${errors[i].header}`);
      for (const d of errors[i].details) {
        console.log(d);
      }
    }
  }

  // Step 5: Print summary.
  console.log("\n— Summary —");
  console.log(`  Sections checked: ${checked}`);
  console.log(`  Mismatched:       ${mismatched}`);

  if (mismatched > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
