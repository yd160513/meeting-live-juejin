// 解析 URL 参数
export const getQueryParams = () => {
  console.log('getQueryParams: ', window.location.hash, window.location.hash.substring(1), new URLSearchParams(window.location.hash.substring(1)))
  return new URLSearchParams(window.location.hash.substring(1))
}

export function getParams(queryName: string) {
  let url = window.location.href
  let query = decodeURI(url.split('?')[1]);
  let vars = query.split("&");
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split("=");
    if (pair[0] === queryName) {
      return pair[1];
    }
  }
  return null;
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

function handleError(error: Error) {
  console.error('navigator.MediaDevices.getUserMedia error: ', error.message, error.name);
}

/**
 * 获取屏幕分享的媒体流
 * @author suke
 * @returns {Promise<void>}
 */
export const getShareMedia = async () => {
  const constraints = {
    video:{width:1920,height:1080},
    audio:false
  };
  return await navigator.mediaDevices.getDisplayMedia(constraints).catch(handleError);
}

/**
 * 获取指定媒体设备id对应的媒体流（不传参数则获取默认的摄像头和麦克风）
 * @param videoId
 * @param audioId
 * @returns {Promise<void>}
 */
export const getTargetDeviceMedia = async (videoId?: string, audioId?: string) => {
  const constraints = {
    audio: {deviceId: audioId ? {exact: audioId} : undefined},
    video: {
      deviceId: videoId ? {exact: videoId} : undefined,
      width:1920,
      height:1080,
      frameRate: { ideal: 10, max: 15 }
    }
  };
  //被调用方法前面有，此处不再重复
  return await getLocalUserMedia(constraints).catch(handleError);
}
