import fs from 'node:fs';
import path from 'node:path';

// Get tag name from CLI arg or environment variable
const rawTag = process.argv[2] || process.env.TAG_NAME || process.env.GITHUB_REF_NAME || '';
const tag = rawTag.trim();
const version = tag.replace(/^v/i, '');

const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');
const outputPath = path.resolve(process.cwd(), 'RELEASE_NOTES.md');

let releaseNotes = '';

if (fs.existsSync(changelogPath)) {
  const content = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n');
  const escapedVersion = version.replace(/\./g, '\\.');

  // Matches '## [1.0.0]' or '## [v1.0.0]' or '## 1.0.0' with optional date and captures content up to the next '## '
  const regex = new RegExp(
    `##\\s*\\[?v?${escapedVersion}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`,
    'i'
  );

  const match = content.match(regex);
  if (match && match[1].trim()) {
    releaseNotes = match[1].trim();
    console.log(`✅ Berhasil mengekstrak changelog untuk versi: ${version}`);
  } else {
    console.warn(`⚠️ Versi [${version}] tidak ditemukan di CHANGELOG.md. Menggunakan fallback template.`);
  }
} else {
  console.warn('⚠️ File CHANGELOG.md tidak ditemukan.');
}

if (!releaseNotes) {
  releaseNotes = `### Release ${tag || 'Update'}\n\nLihat [CHANGELOG.md](CHANGELOG.md) untuk riwayat perubahan lengkap.`;
}

fs.writeFileSync(outputPath, releaseNotes + '\n', 'utf8');
console.log(`📄 Catatan rilis disimpan ke ${outputPath}`);
