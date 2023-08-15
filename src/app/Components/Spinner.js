export default function Spinner({ text }) {
  return(
    <div
      className="modal fade show d-flex flex-row justify-content-center"
      style={{
        display: "block",
        background: "rgba(255, 255, 255, 0.75 )"
      }}
    >
      <div className="align-self-center text-center">
        <div className="spinner-border" role="status">
          <span className="visually-hidden">{text}</span>
        </div>
        <div>
          {text}
        </div>
      </div>
    </div>
  );
}