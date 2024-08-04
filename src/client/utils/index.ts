// 解析 URL 参数
export const getQueryParams = () => {
  return new URLSearchParams(window.location.hash.substring(1))
}

// 获取本地媒体流
export const getLocalUserMedia = async (constraints: MediaStreamConstraints) => {
  return await navigator.mediaDevices.getUserMedia(constraints)
}

// 设置 DOM 元素的媒体流
export const setDomVideoStream = async (domId: string, mediaStream: MediaStream) => {
  let video = document.getElementById(domId) as HTMLVideoElement
  if (!video) {
    console.log('video dom not found')
    return
  }
  let stream = video.srcObject as MediaStream
  if (stream) {
    // 将旧的轨道清除
    stream.getAudioTracks().forEach(e => {
      stream.removeTrack(e)
    })
    stream.getVideoTracks().forEach(e => {
      stream.removeTrack(e)
    })
  }
  video.srcObject = mediaStream
  video.muted = true
}

export const setRemoteDomVideoStream = async (domId: string, track: MediaStreamTrack) => {
  let video = document.getElementById(domId) as HTMLVideoElement
  let stream = video.srcObject as MediaStream
  if (stream) {
    stream.addTrack(track)
  } else {
    let newStream = new MediaStream()
    newStream.addTrack(track)
    video.srcObject = newStream
    video.muted = true
  }
}