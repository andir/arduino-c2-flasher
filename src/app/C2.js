class C2 {
  static ACTIONS = {
    ACK:   0x00,
    INIT:  0x01,
    RESET: 0x02,
    WRITE: 0x03,
    ERASE: 0x04,
    READ:  0x05,
    INFO:  0x08,
    PING:  0x0F,
  };

  constructor(port) {
    this.port = port;
    this.reader = port.readable.getReader();
    this.writer = port.writable.getWriter();
    this.timeoutId = null;
    this.timeout = 1000;
  }

  /**
   * Canel the current reader and get a new one. Canceling a reader will
   * clear the serial buffer.
   */
  async clearBuffer() {
    await this.reader.cancel();
    this.reader = await this.port.readable.getReader();
  }

  /**
   * Write and wait for response, return response if expectedLength or timeout
   * reached.
   *
   * @param {Array} command - The command to send
   * @param {Number} expectedLength - The expected length of the response
   *
   * @returns {Promise<Uint8Array>} Response data
   */
  async writeAndWait(command, expectedLength) {
    this.timeoutId = setTimeout(async () => {
      this.timeoutId = 0;

      await this.reader.releaseLock();
    }, this.timeout);

    let data = new Uint8Array();
    try {
      // Write and wait for response
      await this.writer.write(command);
      while(data.length < expectedLength) {
        const {value, done} = await this.reader.read();
        data = new Uint8Array([...data, ...value]);
      }
    } catch(e) {
      // Reader has been released due to timeout, get a new reader for the next
      // time
      this.reader = this.port.readable.getReader();
    }

    // Read the expected amount of data before timeout hit
    clearTimeout(this.timeoutId)

    return data;
  }

  /**
   * Ping the arduino to check if the C2 interface is flashed.
   *
   * @returns {boolean} If a C2 interface is present
   */
  async hasInterface() {
    const action = C2.ACTIONS.PING;
    const success = action | 0x80;
    const command = new Uint8Array([action, 0x00]);
    const value = await this.writeAndWait(command, 1);

    return (value.length > 0 && value[0] === success);
  }

  /**
   * Reset the C2 interface
   */
  async reset() {
    const action = C2.ACTIONS.RESET;
    const success = action | 0x80;
    const command = new Uint8Array([action, 0x00]);
    const value = await this.writeAndWait(command, 1);

    if(value.length === 0 || value[0] !== success) {
      throw Error("Reset failed");
    }
  }

  /**
   * Initialize the C2 interface
   */
  async initialize() {
    const action = C2.ACTIONS.INIT;
    const success = action | 0x80;
    const command = new Uint8Array([action, 0x00]);
    const value = await this.writeAndWait(command, 1);

    if(value.length === 0 || value[0] !== success) {
      throw Error("Initialization failed");
    }
  }

  /**
   * Returns information about connected MCU
   *
   * @returns {Object} Device information
   */
  async getDeviceInfo() {
    const action = C2.ACTIONS.INFO;
    const success = action | 0x80;
    const command = new Uint8Array([action, 0x00]);
    const value = await this.writeAndWait(command, 4);

    if(value.length !== 4 || value[0] !== success) {
      throw Error("Fetching device info failed");
    }

    return {
      id: '0x' + value[1].toString(16).padStart(2, '0').toUpperCase(),
      revision: '0x' + value[2].toString(16).padStart(2, '0').toUpperCase(),
    };
  }

  /**
   * Read a certain amount of data from a specific address
   *
   * @param {Number} address - The address to read from
   * @param {Number} amount - The amount of bytes to read
   *
   * @returns {Uint8Array}
   */
  async read(address, amount) {
    const action = C2.ACTIONS.READ;
    const success = action | 0x80;
    const command = new Uint8Array([
      action, action,
      amount,
      (address >> 16) & 0xFF,
      (address >> 8) & 0xFF,
      address & 0xFF,
      0x00,
    ]);
    const value = await this.writeAndWait(command, amount + 1);

    if(value.length === 0 || value[0] !== success) {
      throw Error(`Failed reading ${amount} bytes @ 0x${address.toString(16).toUpperCase()}`);
    }

    // Remove status byte and return data
    return value.slice(1);
  }

  /**
   * Erase the MCU.
   */
  async erase() {
    const action = C2.ACTIONS.ERASE;
    const success = action | 0x80;
    const command = new Uint8Array([action, 0x00]);
    const value = await this.writeAndWait(command, 1);

    if(value.length === 0 || value[0] !== success) {
      throw Error("Erasing failed");
    }
  }

  /**
   * Write data to a specific addresss
   *
   * @param {number} address - Starting address
   * @param {Array} data - The data to write
   */
  async write(address, data) {
    const action = C2.ACTIONS.WRITE;
    const success = action | 0x80;
    const crcError = action & 0x40;

    const addressHi = (address >> 8) & 0xFF;
    const addressLo = address & 0xFF;
    const dataLength = data.length;
    const totalLength = dataLength + 5;
    let crc = addressHi + addressLo;
    for(let i = 0; i < data.length; i += 1) {
      crc += data[i];
    }
    crc &= 0XFF;

    const command = new Uint8Array([
      action,
      totalLength,
      dataLength,
      0,
      addressHi,
      addressLo,
      crc,
      ...data,
    ]);
    const value = await this.writeAndWait(command, 1);

    if(value.length > 0 && value[0] === crcError) {
      throw Error(`@ ${address.toString(16).toUpperCase()}: CRC wrong`);
    }

    if(value.length === 0 || value[0] !== success) {
      throw Error(`@ ${address.toString(16).toUpperCase()}: writing failed`);
    }
  }

  /**
   * Close serial port by releasing reader and writer and finally closing the
   * port.
   */
  async close() {
    await this.reader.releaseLock();
    await this.writer.releaseLock();
    await this.port.close();
  }
}

export default C2;