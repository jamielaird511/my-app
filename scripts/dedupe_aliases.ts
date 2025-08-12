import fs from 'fs';
import path from 'path';

const filePath = path.resolve('data', 'hs_aliases.csv');
const fileContent = fs.readFileSync(filePath, 'utf-8');

const lines = fileContent.trim().split('\n');
const header = lines.shift(); // keep header row

const seen = new Set<string>();
const deduped = [header!];

for (const line of lines) {
  const [code, description, alias] = line.split(',');
  const key = `${code}|${alias}`;
  if (!seen.has(key)) {
    seen.add(key);
    deduped.push(line);
  }
}

const outputPath = path.resolve('data', 'hs_aliases_deduped.csv');
fs.writeFileSync(outputPath, deduped.join('\n'));
console.log(`✅ Deduped file saved to ${outputPath} with ${deduped.length - 1} unique rows`);
