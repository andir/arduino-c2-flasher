export default function Intor() {
  return(
    <div className="row py-2">
      <h1>Arduino C2 Interface</h1>
      <p>This is a web based <a target="_blank" href="https://www.silabs.com/documents/public/application-notes/AN127.pdf">C2 interface</a> for flashing and reading SiLabs EFM8 based BusyBee MCUs. You will to connect an <strong>Arduino UNO or Nano</strong> to your PC. Once you have everything setup, click the &quot;Connect to Arduino&quot; button where you will have to select the serial port that coresponds with your Arduino. From there on you will be guided through the whole process, your arduino will be flashed with the needed firmware during the process.</p>
      <p>Should you run into any issues, feel free to drop by on <a href="github.com">github</a> and let me know.</p>
    </div>
  );
}