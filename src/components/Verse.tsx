export function Verse({ verse, text }: { verse: number; text: string }) {
  return (
    <span className="verse">
      <sup className="verse-number">{verse}</sup> {text}
    </span>
  );
}
