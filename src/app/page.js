'use client';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Script from 'next/script';
import avrbro from 'avrbro';
import Dropzone from 'react-dropzone';

import 'bootstrap/dist/css/bootstrap.css';

import C2 from './C2';
import {
  readFileAsync,
  wait,
} from './helpers';

import Browser from './Components/Browser';
import Error from './Components/Error';
import Footer from './Components/Footer';
import Intro from './Components/Intro';
import Spinner from './Components/Spinner';

import arduinoUnoPic from '../../public/arduino_uno_c2.png';

export default function Home() {
  const [port, setPort] = useState(null);

  const [isConnected, setIsConnected] = useState(false);
  const [portSelected, setPortSelected] = useState(false);

  const [c2InterfaceChecked, setC2interfaceChecked] = useState(false);
  const [c2InterfaceDetected, setC2interfaceDetected] = useState(false);

  const [spinnerText, setSpinnerText] = useState('Loading...');
  const [showSpinner, setShowSpinner] = useState(false);

  const [deviceInfo, setDeviceInfo] = useState(null);

  const [initializationFailed, setInitializationFailed] = useState(false);

  const [hasErased, setHasErased] = useState(false);
  const [hasWritten, setHasWritten] = useState(false);

  const [disableControls, setDisableControls] = useState(false);
  const [supportedBrowser, setSupportedBrowser] = useState(true);

  const c2 = useRef(null);
  const readDataTemp = useRef([]);
  const [readData, setReadData] = useState([]);

  const errorsTemp = useRef([]);
  const [errors, setErrors] = useState([]);

  const [readError, setReadError] = useState(false);
  const [openError, setOpenError] = useState(false);

  const cleanErrors = useCallback(() => {
    errorsTemp.current = [];
    setErrors(errorsTemp.current);
  }, [errorsTemp, setErrors]);

  const appendError = useCallback((e) => {
    errorsTemp.current = [
      e.message,
      ...errorsTemp.current,
    ];

    setErrors(errorsTemp.current);
  }, [errorsTemp, setErrors]);

  // Read data from device - does not display spinner
  const handleC2InterfaceRead = useCallback(async () => {
    cleanErrors();

    setDisableControls(true);

    const start = 0;
    const size = 0x37FF;
    const chunksize = 0x10;

    readDataTemp.current = [];
    for(let address = start; address < size; address += chunksize) {
      try {
        const data = await c2.current.read(address, chunksize);

        readDataTemp.current = [
          {
            address,
            data,
          },
          ...readDataTemp.current,
        ];

        setReadData(readDataTemp.current);
      } catch(e) {
        setReadError(true);
        appendError(e);
      }
    }

    setDisableControls(false);
  }, [appendError, cleanErrors, c2, readDataTemp]);

  // Write HEX file to device - displays spinner
  const handleC2InterfaceWrite = useCallback(async (files) => {
    cleanErrors();

    setSpinnerText("Writing HEX file...");
    setDisableControls(true);
    setShowSpinner(true);
    setHasWritten(false);

    const file = files[0];
    const content = await readFileAsync(file);
    const lines = content.split("\n");

    await c2.current.erase();
    for(let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const byteCount = parseInt(line.slice(1, 3), 16);

      if(byteCount > 0) {
        const address = parseInt(line.slice(3, 7), 16);
        const type = parseInt(line.slice(7, 9), 16);

        const data = [];
        for(let j = 0; j < (byteCount * 2); j += 2) {
          const byte = parseInt(line.slice(9 + j, 11 + j), 16);
          data.push(byte);
        }
        try {
          await c2.current.write(address, data);
        } catch(e) {
          appendError(e);
        }
      }
    }

    setHasWritten(true);
    setDisableControls(false);
    setShowSpinner(false);
  }, [appendError, cleanErrors]);

  const handleC2InterfaceFlash = useCallback(async (e) => {
    e.preventDefault();

    setSpinnerText("Writing C2 interface to Arduino...");
    setDisableControls(true);
    setShowSpinner(true);

    const target = e.target;
    const board = target.board.value;
    let newReader = null;
    let newWriter = null;

    // Set bin file based on board
    let bin = "uno_nano";
    switch(board) {
      case "uno":
      case "nano": {
        bin = "uno_nano";
      } break;
    }

    // Read hex file for selected arduino
    const response = await fetch(`/arduino-c2-flasher/bins/${bin}.hex`);
    const data = await response.blob();
    const fileData = await readFileAsync(data, true);
    const hexBuffer = avrbro.parseHex(new TextDecoder("utf-8").decode(fileData));

    // Newer bootloaders flash with faster speeds, try that first - if it does
    // not work, try the slower speed
    let timeoutId = null

    const baudRates = [115200, 57600];
    for(let i = 0; i < baudRates.length; i += 1) {
      const baudRate = baudRates[i];
      console.log(`Attempting to flash with ${baudRate}`);

      try {
        await port.open({ baudRate });
        newReader = await port.readable.getReader();
        newWriter = await port.writable.getWriter();

        const newSerial = {
          port,
          reader: newReader,
          writer: newWriter,
        };

        // If not flashed within 5 seconds, the baudrate is wrong, abort and try
        // with next baudrate.
        timeoutId = setTimeout(async () => {
          timeoutId = null;

          // Canceling reader will throw an error which we handle
          // in the catch clause, releassing locks and closing the serial port
          await newSerial.reader.cancel();
        }, 5000);

        await avrbro.reset(newSerial);
        const success = await avrbro.flash(newSerial, hexBuffer, {
          boardName: board,
          debug: true,
        });
        await avrbro.closeSerial(newSerial);
        clearTimeout(timeoutId);

        if (success) {
          setC2interfaceChecked(false);
          break;
        } else {
          console.log('an error has occurred.');
        }
      } catch(e) {
        console.log("Failed flashing hex file", e);
        clearTimeout(timeoutId);
      }

      await newWriter.releaseLock();
      await newReader.releaseLock();
      await port.close();
    }

    setDisableControls(false);
    setShowSpinner(false);
  }, [port]);

  // Close connection and reload page in order to reset state
  const handleArduinoDisconnect = useCallback(async () => {
    setSpinnerText("Disconnecting...");
    setShowSpinner(true);

    try {
      await c2.current.close();
    } catch(e) {
      console.log("Failed closing C2 interface");
    }

    location.reload();
  }, []);

  // Erase device - displays spinner
  const handleC2InterfaceErase = useCallback(async () => {
    cleanErrors();

    setSpinnerText("Erasing...");
    setDisableControls(true);
    setShowSpinner(true);
    setHasErased(false);

    try {
      await c2.current.erase();
      setHasErased(true);
    } catch (e) {
      appendError(e);
    }

    setShowSpinner(false);
    setDisableControls(false);
  }, [appendError, cleanErrors]);

  const handleInitialization = useCallback(async () => {
    setShowSpinner(true);
    setSpinnerText("Initializing...");

    try {
      await c2.current.clearBuffer();
      await c2.current.initialize();
      setInitializationFailed(false);

      try {
        setSpinnerText("Getting device info...");
        const info = await c2.current.getDeviceInfo();
        setDeviceInfo(info);

        // If 0xFF are returned for id and revision initi must have failed.
        if(info.id === "0xFF" && info.revision === "0xFF") {
          setInitializationFailed(true);
        }
      } catch(e) {
        console.log("Failed fetching device info", e);
      }
    } catch(e) {
      setInitializationFailed(true);
      console.log("Initialization failed", e);
    }

    setShowSpinner(false);
  }, [setSpinnerText, setDeviceInfo, setInitializationFailed]);

  useEffect(() => {
    if(port && !c2InterfaceChecked) {
      const check = async () => {
        setShowSpinner(true);

        try {
          const baudRate = 1000000;
          await port.open({ baudRate });

          setIsConnected(true);

          // IMPORTANT: Give arduino some time
          await wait(2000);

          c2.current = new C2(port);
          const hasC2Interface = await c2.current.hasInterface();

          setC2interfaceChecked(true);
          if(hasC2Interface) {
            setC2interfaceDetected(true);

            await handleInitialization();
          } else {
            setC2interfaceDetected(false);
            c2.current.close();
          }
        } catch(e) {
          setIsConnected(false);
          setOpenError(true);
        }

        setShowSpinner(false);
      };

      setSpinnerText("Checking C2 interface...");
      check();
    }

    setSupportedBrowser(navigator.serial ? true : false);
  }, [port, c2InterfaceChecked, handleInitialization]);

  // Connect to Arduino and set chosen port - do not open the connection yet
  const handleArduinoConnect = useCallback(async () => {
    setDisableControls(true);
    setShowSpinner(true);
    setSpinnerText("Connecting to Arduino");

    try {
      const newPort = await navigator.serial.requestPort();

      setPort(newPort);
      setPortSelected(true);
    } catch(e) {
      setPortSelected(false);
    }

    setShowSpinner(false);
    setDisableControls(false);
  }, []);

  const formattedReadData = readData.map((item) => {
      const a = (val) => (val & 0xFF).toString(16).padStart(2, "0");
      const dataString = Array.from(item.data).map(a);
      const sum = (items) => Array.from(items).reduce((a, b) => a + b, 0);
      const address = a(item.address >> 8) + a(item.address & 0xFF);
      const crc = sum([item.data.length, (item.address >> 8) & 0xFF, (item.address & 0xFF), 0x00]) + sum(item.data);

      return ':' + a(item.data.length)
	  + address
          + "00"
	  + dataString.join('')
          + a(crc);
  });
  const formattedStringData = formattedReadData.join("\n");

  let deviceString = "Unknown device / Initialization failed";
  if(deviceInfo && deviceInfo.id !== 0 && deviceInfo.revision !== 0) {
    deviceString = `Device ID: ${deviceInfo.id} Revision: ${deviceInfo.revision}`;
  }

  return (
    <>
      <main
        className="container"
      >
        <Intro />

        {!isConnected && supportedBrowser &&
          <div className="row g-3 ">
            <div className="col-12">
              <div className="d-flex justify-content-center" >
                <button
                  className="btn btn-primary btn-lg"
                  onClick={handleArduinoConnect}
                  disabled={disableControls}
                >
                  Connect to Arduino
                </button>
              </div>
            </div>


          {openError &&
            <div
              className="col-12 alert alert-danger"
              role="alert"
            >
              <p><strong>There was an error opening the serial port.</strong><br/>
              Make sure the device is not claimed by any other program and try again.</p>
              Known culprits for claiming serial devices are
              <ul>
                <li>having the application open in mutliple tabs</li>
                <li>Arduino serial monitor</li>
                <li>Cura</li>
              </ul>
              <strong>Note:</strong>You might need to unplug and re-plug your Arduino in order for it to be picked up correctly.
            </div>}
          </div>}

        {!supportedBrowser && <Browser /> }

        {c2InterfaceChecked &&
          <>
            {c2InterfaceDetected && !initializationFailed &&
              <>
                <div className="row py-2">
                  <div className="col">
                    <div
                      className="alert alert-success"
                      role="alert"
                    >
                      <strong>Arduino C2 interface detected & MCU initialized!</strong><br />
                      You can now either read the MCU or drag a HEX file into the file dropper area to write it or erase it.
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="col">
                    {deviceString}
                  </div>
                  <div className="col">
                    {isConnected &&
                      <div className="col d-flex justify-content-end" >
                        <button
                          className="btn btn-primary"
                          onClick={handleArduinoDisconnect}
                          disabled={disableControls}
                        >
                          Disconnect
                        </button>
                      </div>}
                  </div>
                </div>

                <div className="row py-2">
                  <div className="col-12">
                    <ul
                      className="nav nav-tabs mb-3"
                      role="tablist"
                    >
                      <li className="nav-item">
                        <button
                          className="nav-link active"
                          id="read-tab"
                          data-bs-toggle="tab"
                          data-bs-target="#read"
                          type="button"
                          role="tab"
                          aria-controls="read"
                          aria-selected="true"
                        >
                          Read
                        </button>
                      </li>
                      <li className="nav-item">
                        <button
                          className="nav-link"
                          id="read-tab"
                          data-bs-toggle="tab"
                          data-bs-target="#erase"
                          type="button"
                          role="tab"
                          aria-controls="erase"
                          aria-selected="false"
                        >
                          Erase
                        </button>
                      </li>
                      <li className="nav-item">
                        <button
                          className="nav-link"
                          id="read-tab"
                          data-bs-toggle="tab"
                          data-bs-target="#write"
                          type="button"
                          role="tab"
                          aria-controls="write"
                          aria-selected="false"
                        >
                          Write
                        </button>
                      </li>
                    </ul>
                    <div className="tab-content" id="myTabContent">
                      <div
                        className="tab-pane fade show active"
                        id="read"
                        role="tabpanel"
                        aria-labelledby="read-tab"
                      >
                        <p>
                          <button
                            className="btn btn-primary"
                            onClick={handleC2InterfaceRead}
                            disabled={disableControls}
                          >
                            Read MCU
                          </button>
                        </p>

                        {readError &&
                          <div className="alert alert-warning">
                            It seems your MCU can not be read although a device ID could be fetched.<br/>
                            This is often times an indicator that the lock byte is set to prevent read out via C2 interface. You might still be able to erase the MCU and flash new firmware.
                          </div>}

                        <pre
                          style={{
                            height: 300,
                            overflowY: "scroll",
                          }}
                        >
                          <code>
                            {formattedStringData}
                          </code>
                        </pre>
                      </div>

                      <div
                        className="tab-pane fade"
                        id="erase"
                        role="tabpanel"
                        aria-labelledby="erase-tab"
                      >
                        <p>
                          <button
                            className="btn btn-primary"
                            onClick={handleC2InterfaceErase}
                            disabled={disableControls}
                          >
                            Erase MCU
                          </button>
                        </p>

                        {hasErased &&
                          <div
                            className="alert alert-success"
                            role="alert"
                          >
                            <strong>MCU has been sucessfully erased!</strong><br />
                            You can verify this by reading back the data, <strong>all values should be 0xFF</strong>.
                          </div>}
                      </div>

                      <div
                        className="tab-pane fade"
                        id="write"
                        role="tabpanel"
                        aria-labelledby="write-tab"
                      >
                        <p>Double check that you are selecting the correct HEX file for your device. Flashing the wrong HEX file - no matter the device - can lead to permanent damage.</p>

                        <div className="col-12 drop-zone border">
                          <Dropzone
                            accept={{
                              'text/*': ['.hex', '.HEX'],
                            }}
                            maxFiles={1}
                            onDrop={handleC2InterfaceWrite}
                          >
                            {({getRootProps, getInputProps}) => (
                              <section>
                                <div {...getRootProps()}>
                                  <input {...getInputProps()} />
                                  <p>Drag and drop a HEX file here, or click to select a file.</p>
                                </div>
                              </section>
                            )}
                          </Dropzone>
                        </div>

                        {hasWritten && errors.length === 0 &&
                          <div
                            className="alert alert-success my-3"
                            role="alert"
                          >
                            <strong>Data has been written to MCU!</strong>
                          </div>}
                      </div>
                    </div>
                  </div>
                  <div className="col">
                  </div>

                  <div className="col">
                  </div>

                </div>
              </>}

            {!c2InterfaceDetected &&
              <>
                <div className="row py-2">
                  <div className="col-12">
                    <div
                      className="alert alert-danger"
                      role="alert"
                    >
                      <strong>Arduino C2 interface not detected!</strong><br />
                      C2 interface could not be detected on connected serial device, this is to be expected if you are connecting for the first time.<br />
                      Please select your arduino and flash the C2 interface.<br /><br />
                      <strong>Attention:</strong> Please be aware that flashing the C2 interface will erase the content of the Arduino.
                    </div>
                  </div>
                </div>

                <form
                  className="row g-3"
                  onSubmit={handleC2InterfaceFlash}
                >
                  <div className="col-auto">
                    <select
                      name="board"
                      className="form-select"
                      aria-label="Select Arduino"
                    >
                      <option value="uno">Arduino UNO</option>
                      <option value="nano">Arduino Nano</option>
                    </select>
                  </div>

                  <div className="col-auto">
                    <button
                      className="btn btn-primary"
                      type="submit"
                    >
                      Flash C2 interface to Arduino
                    </button>
                  </div>
                </form>
              </>
            }

            {initializationFailed &&
              <>
                <div className="row py-2">
                  <div className="col-12">
                    <div
                      className="alert alert-warning"
                      role="alert"
                    >
                      <p><strong>Initialization failed!</strong><br/>
                      <strong>C2 interface has been detected to be flashed to the Arduino</strong>, but the MCU could not be initialized.<br/>
                      Make sure that the wires are connected to the MCU, Arduino is connected with GND of the MCU and the MCU is powered.</p>
                      If your MCU is on a PCB (like for example an ESC, AIO flight controller or similar), chances are that the C2 interface pins are broken out and next to each other close to the MCU. Should you not be sure which on is which, just try both combinations for <strong>CK</strong> and <strong>D</strong>.
                    </div>
                  </div>

                  <div className="col-12">
                    <button
                      className="btn btn-primary"
                      onClick={handleInitialization}
                    >
                      Initialize
                    </button>
                  </div>

                  <div className="col-6">
                    <Image
                      alt="Arduino UNO pinout"
                      src={arduinoUnoPic}
                      style={{
                        width: "100%",
                        height: "auto"
                      }}
                    />
                  </div>
                </div>
              </>
            }
          </>}

          {errors.length > 0 && <Error errors={errors} />}
      </main>

      <Footer />

      {showSpinner && <Spinner text={spinnerText} />}

      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.min.js"/>
    </>
  );
}
