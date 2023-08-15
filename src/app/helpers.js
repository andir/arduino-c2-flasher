const readFileAsync = (file) => {
  return new Promise((resolve, reject) => {
    let reader = new FileReader()
    reader.onload = () => {
      resolve(reader.result)
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

const wait = (duration) => {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

export {
  readFileAsync,
  wait,
}