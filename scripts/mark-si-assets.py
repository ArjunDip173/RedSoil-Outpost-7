"""Writes an "SI-assisted" note into the metadata of the game's art and sound files.

The 2026 Space Apps rules ask teams to acknowledge SI-generated audio in its metadata, and our sprites were modified
and enhanced with SI. This adds:
  - a PNG tEXt "Description" chunk to each sprite sheet,
  - a WAV LIST/INFO "ICMT" (comment) chunk to each sound effect,
  - an ID3v2.4 "COMM" (comment) frame to each music track.
Running it again does nothing to files that already carry the note.

Usage: python3 scripts/mark-si-assets.py
"""

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MARK = "SI-assisted"
ART_NOTE = (
    "SI-assisted art: pixel art drawn by SideLoaders for Red Soil: Outpost 7, "
    "later modified and enhanced with SI (AI) tools. See docs/SI_DISCLOSURE.md."
)
AUDIO_NOTE = (
    "SI-assisted audio: generated or edited with AI audio tools for Red Soil: Outpost 7 "
    "by SideLoaders. See docs/SI_DISCLOSURE.md."
)


def mark_png(path: Path) -> bool:
    data = path.read_bytes()
    if MARK.encode() in data:
        return False
    body = b"Description\x00" + ART_NOTE.encode("latin-1")
    chunk = struct.pack(">I", len(body)) + b"tEXt" + body
    chunk += struct.pack(">I", zlib.crc32(b"tEXt" + body) & 0xFFFFFFFF)
    # the first chunk is IHDR (8-byte signature + 4 length + 4 type + 13 data + 4 crc = 33 bytes)
    assert data[12:16] == b"IHDR"
    path.write_bytes(data[:33] + chunk + data[33:])
    return True


def mark_wav(path: Path) -> bool:
    data = bytearray(path.read_bytes())
    if MARK.encode() in data:
        return False
    assert data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if len(data) % 2:
        data += b"\x00"  # chunks start on even offsets
    text = AUDIO_NOTE.encode("latin-1") + b"\x00"
    if len(text) % 2:
        text += b"\x00"
    info = b"INFO" + b"ICMT" + struct.pack("<I", len(text)) + text
    data += b"LIST" + struct.pack("<I", len(info)) + info
    data[4:8] = struct.pack("<I", len(data) - 8)
    path.write_bytes(bytes(data))
    return True


def syncsafe(n: int) -> bytes:
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def unsyncsafe(b: bytes) -> int:
    return (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3]


def mark_mp3(path: Path) -> bool:
    data = path.read_bytes()
    if MARK.encode() in data[:4096]:
        return False
    # COMM frame: text encoding (UTF-8), language, empty short description, then the comment
    body = b"\x03" + b"eng" + b"\x00" + AUDIO_NOTE.encode("utf-8")
    frame = b"COMM" + syncsafe(len(body)) + b"\x00\x00" + body
    if data[:3] == b"ID3":
        assert data[3] == 4 and data[5] == 0, "only plain ID3v2.4 tags are handled"
        size = unsyncsafe(data[6:10])
        tag = data[10 : 10 + size].rstrip(b"\x00")  # existing frames without the padding
        new_tag = tag + frame
        header = b"ID3\x04\x00\x00" + syncsafe(len(new_tag))
        path.write_bytes(header + new_tag + data[10 + size :])
    else:
        header = b"ID3\x04\x00\x00" + syncsafe(len(frame))
        path.write_bytes(header + frame + data)
    return True


def main() -> None:
    changed = []
    for png in sorted((ROOT / "src/assets/sprites").glob("*.png")):
        if mark_png(png):
            changed.append(png)
    for wav in sorted((ROOT / "src/assets/audio").glob("*.wav")):
        if mark_wav(wav):
            changed.append(wav)
    for mp3 in sorted((ROOT / "src/assets/audio").glob("*.mp3")):
        if mark_mp3(mp3):
            changed.append(mp3)
    for p in changed:
        print("marked", p.relative_to(ROOT))
    print(f"{len(changed)} file(s) marked")


if __name__ == "__main__":
    main()
