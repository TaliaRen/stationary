// A small strip of masking tape with a handwritten component name.
export default function TapeLabel({ text, style, rotate = -4 }) {
  return (
    <div className="washi" style={{ ...style, '--r': `${rotate}deg` }} aria-hidden="true">
      <div className="washi-strip">
        <span>{text}</span>
      </div>
    </div>
  );
}
