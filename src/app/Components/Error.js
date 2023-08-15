export default function Error({ errors }) {
  const errorElements = errors.map((error, index) => {
    return(
      <li key={index}>
        {error}
      </li>
    );
  });

  return(
    <div className="row py-2">
      <div className="col">
        <div
          className="alert alert-danger"
          role="alert"
        >
          <strong>Something went wrong:</strong>
          <ul className="my-0">
            {errorElements}
          </ul>
        </div>
      </div>
    </div>
  );
}