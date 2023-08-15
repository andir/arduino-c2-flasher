export default function Browser() {
  return(
    <div className="row py-2">
      <div className="col">
        <div
          className="alert alert-danger"
          role="alert"
        >
          <strong>Your Browser is not supported!</strong><br />
          Your Broswer does not support the web serial functionality. Please use a Chromium based Browser like Chrome, Edge, Vivaldi or similar.<br />
          <strong>Attention:</strong> Although Brave being a Chromium based Browser, they do not trust their users enough to let them use web serial.
        </div>
      </div>
    </div>
  );
}