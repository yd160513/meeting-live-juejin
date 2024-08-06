<script setup lang="ts">
/**
 * 启动该 demo 需要将 server 目录下的 virtualbg-model 文件夹作为服务器启动，可以通过 http-server 来启动，后面处理背景时会用到
 *
 * 实现直播 demo
 * 老师端: http://localhost:5173/vbpage/#?roomId=2016&userId=9999&role=pub&nickname=T
 * 学生端:
 * 1. http://localhost:5173/vbpage/#?roomId=2016&userId=01&nickname=S1
 * 2. http://localhost:5173/vbpage/#?roomId=2016&userId=02&nickname=S2
 * 3. http://localhost:5173/vbpage/#?roomId=2016&userId=03&nickname=S3
 * ---
 * 实现流程:
 * 1. 初始化 socket
 * 2. 初始化学生端、老师端
 * 3. 学生端主叫、老师端被叫
 * 4. 老师端发送自己的画面；学生端只接收老师的画面，不发送自己的画面
 */
import {io, type Socket} from "socket.io-client";
import {onMounted, ref} from "vue";
import {
  getLocalUserMedia,
  getQueryParams,
  getTargetDeviceMedia,
  setDomVideoStream,
  setRemoteDomVideoStream
} from "@/utils";
import * as SFS from "@mediapipe/selfie_segmentation";
import bg from '@/assets/bg2.jpg'

const userInfo = ref({
  roomId: '',
  userId: '',
  role: '',
  nickname: ''
})

// 虚拟定义
const T = '9999'
const S1 = '01'
const S2 = '02'
const S3 = '03'

// 老师端维护数据
const tMap: Map<string, RTCPeerConnection> = new Map()
tMap.set(`${T}-${S1}`, new RTCPeerConnection())
tMap.set(`${T}-${S2}`, new RTCPeerConnection())
tMap.set(`${T}-${S3}`, new RTCPeerConnection())
// 学生端维护数据
const sMap: Map<string, RTCPeerConnection> = new Map()
sMap.set(`${S1}-${T}`, new RTCPeerConnection())
sMap.set(`${S2}-${T}`, new RTCPeerConnection())
sMap.set(`${S3}-${T}`, new RTCPeerConnection())

let localSocket: Socket
let localRtcPc: RTCPeerConnection
let canvasCtx: CanvasRenderingContext2D
let canvasElement: HTMLCanvasElement
let image: HTMLImageElement
let selfieSegmentation: any

const rfId = ref(0)

const handler = async () => {
  let video = document.getElementById('local-video') as HTMLVideoElement
  let newStream = await getTargetDeviceMedia() as MediaStream
  video.srcObject = newStream
  video.muted = true
  await virtualBg()

  // 将虚拟背景的流发送到远端
  const canvas = document.getElementById('output-canvas') as HTMLCanvasElement;
  const vbMediaStream = canvas.captureStream(30)
  const videoTrack = vbMediaStream.getVideoTracks()[0];
  const sender = localRtcPc.getSenders().find(s => s.track?.kind === 'video');
  if (sender) {
    try {
      await sender.replaceTrack(videoTrack);
      console.log('Original track restored successfully');
    } catch (error) {
      console.error('Error restoring original track: ', error);
    }
  }
}

/**
 * 监听触发模型处理
 */
const virtualBg = async () => {
  let video = document.getElementById('local-video') as HTMLVideoElement
  if(rfId.value){
    cancelAnimationFrame(rfId.value)
  }
  video.addEventListener('playing',function(){
    let myvideo = this;
    let lastTime = new Date();
    async function getFrames() {
      const now = myvideo.currentTime;
      if(now > lastTime){
        await selfieSegmentation.send({image: myvideo});
      }
      lastTime = now;
      //无限定时循环 退出记得取消 cancelAnimationFrame()
      rfId.value = requestAnimationFrame(getFrames);
    };
    getFrames()
  })
}

// 对背景进行处理
const handleResults = (results) => {
  // Prepare the new frame
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
  // Draw the image as the new background, and the segmented video on top of that
  canvasCtx.globalCompositeOperation = 'source-out';
  canvasCtx.drawImage(image, 0, 0, image.width, image.height, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.globalCompositeOperation = 'destination-atop';
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  // Done
  canvasCtx.restore();
}
// 对人像进行处理
const onResults = (results) => {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.segmentationMask, 0, 0, canvasElement.width, canvasElement.height);
  // Only overwrite existing pixels.
  canvasCtx.globalCompositeOperation = 'source-in';
  canvasCtx.fillStyle = '#00FF00';
  canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
  // Only overwrite missing pixels.
  canvasCtx.globalCompositeOperation = 'destination-atop';
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.restore();
}

const initVb = async () => {
  console.log('initVb')
  canvasElement = document.getElementById('output-canvas') as HTMLCanvasElement
  canvasCtx = canvasElement.getContext('2d') as CanvasRenderingContext2D
  image = new Image()
  image.src = bg
  selfieSegmentation = new SFS.SelfieSegmentation({locateFile: (file) => {
      console.log(file);
      return `http://127.0.0.1:5500/${file}`;//ng  代理模型文件夹
    }});
  selfieSegmentation.setOptions({
    modelSelection: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  selfieSegmentation.onResults(handleResults);
  // selfieSegmentation.onResults(onResults);

}

const onRemoteAnswer = async (data) => {
  await localRtcPc.setRemoteDescription(data.answer)
}

const onRemoteOffer = async (data) => {
  await localRtcPc.setRemoteDescription(data.offer)
  const answer = await localRtcPc.createAnswer()
  await localRtcPc.setLocalDescription(answer)

  localSocket.emit('answer', {
    userId: data.targetUid,
    targetUid: data.userId,
    answer
  })
}

const onPcEvent = async (pc: RTCPeerConnection, userId: string, targetUid: string) => {
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      localSocket.emit('candidate', {
        userId,
        targetUid,
        candidate: event.candidate
      })
    } else {
      console.log('candidate is null')
    }
  }
  pc.onnegotiationneeded = async () => {
    console.log('onnegotiationneeded 重新协商')
  }
  pc.ontrack = (event) => {
    console.log('ontrack', event)
    setRemoteDomVideoStream('remote-video', event.track)
  }
}

/**
 * 收到远端呼叫，初始化 PC，建立 PC 监听
 * @param data
 */
const onCall = async (data) => {
  console.log('onCall', data)
  localRtcPc = tMap.get(`${T}-${data.userId}`) as RTCPeerConnection

  await onPcEvent(localRtcPc, data.userId, data.targetUid)

  const localStream = await getLocalUserMedia({ video: true, audio: true })

  for (const track of localStream.getTracks()) {
    localRtcPc.addTrack(track)
  }

}

/**
 * 初始化学生端，学生是主叫
 */
const initStudent = async () => {
  console.log('initStudent')

  localSocket.emit('call', {
    userId: userInfo.value.userId,
    roomId: userInfo.value.roomId,
    targetUid: T,
  })

  localRtcPc = sMap.get(`${userInfo.value.userId}-${T}`) as RTCPeerConnection

  // 这一步要尽早的添加，因为 call 发出去之后，被叫就会 addTrack。这里尽早的添加，就可以尽早的收到远端的流
  localRtcPc.addTransceiver("audio", {direction: "recvonly"});
  localRtcPc.addTransceiver("video", {direction: "recvonly"});

  await onPcEvent(localRtcPc, userInfo.value.userId, T)

  const offer = await localRtcPc.createOffer()
  await localRtcPc.setLocalDescription(offer)

  localSocket.emit('offer', {
    userId: userInfo.value.userId,
    targetUid: T,
    offer
  })
}

/**
 * 初始化老师端
 * 老师作为被叫，初始化时只需要将本地画面渲染到页面上即可
 */
const initTeacher = async () => {
  console.log('initTeacher')
  // 获取本地流，渲染到页面
  const localStream = await getLocalUserMedia({ video: true, audio: true })
  await setDomVideoStream('local-video', localStream)
}

const initSocket = async () => {
  localSocket = io('http://localhost:18080', {
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    query: {
      roomId: userInfo.value.roomId,
      userId: userInfo.value.userId,
      role: userInfo.value.role,
      nickname: userInfo.value.nickname
    }
  })

  localSocket.on('message', async (message) => {
    console.log('socket message', message)

    const type = message.type
    const data = message.data

    if (type === 'call') {
      console.log('远端呼叫')
      await onCall(data)
    }

    if (type === 'join' || type === 'leave') {
      console.log('加入/离开房间')
      setTimeout(() => {
        localSocket.emit('roomUserList', {
          userId: userInfo.value.userId,
          roomId: userInfo.value.roomId
        })
      }, 1000)
    }

    if (type === 'offer') {
      console.log('收到远端 offer')
      await onRemoteOffer(data)
    }

    if (type === 'answer') {
      console.log('收到远端 answer')
      await onRemoteAnswer(data)
    }

    if (type === 'candidate') {
      console.log('收到远端 candidate')
      await localRtcPc.addIceCandidate(data.candidate)
    }

  })

  localSocket.on('roomUserList', async (data) => {
    console.log('roomUserList', data)
  })

  localSocket.on('connect', async () => {
    console.log('socket connect')
  })

  localSocket.on('disconnect', async () => {
    console.log('socket disconnect')
  })

  localSocket.on('error', async (error) => {
    console.log('socket error', error)
  })

  localSocket.on('connect_error', async (error) => {
    console.log('socket connect_error', error)
  })

}

const init = async () => {

  const nickname = getQueryParams().get('nickname')
  const role = getQueryParams().get('role') || ''
  const userId = getQueryParams().get('userId')
  const roomId = getQueryParams().get('roomId')

  if (!roomId || !userId || !nickname) {
    return console.error('参数错误')
  }

  userInfo.value.nickname = nickname
  userInfo.value.role = role
  userInfo.value.userId = userId
  userInfo.value.roomId = roomId

  await initSocket()
  if (userInfo.value.role === 'pub') {
    await initTeacher()
  } else {
    await initStudent()
  }
}

init()

onMounted(() => {
  initVb()
})

</script>

<template>
  <div class="virtual-background-page">
    <div class="local-content">
      <div class="local-box">
        <div>
          本地画面
        </div>
        <video id="local-video" autoplay playsinline></video>
      </div>
      <div class="vb-box">
        <div class="button" @click="handler">
          打开虚拟背景
        </div>
        <canvas id="output-canvas"></canvas>
      </div>
    </div>
    <div class="remote-content">
      <div>
        远端画面
      </div>
      <video id="remote-video" autoplay playsinline></video>
    </div>
  </div>
</template>

<style scoped>
.button {
  border: 1px solid #000;
  padding: 5px;
  cursor: pointer;
}
#output-canvas {
  width: 100%;
}
.local-content {
  display: flex;
}
.remote-content, .local-box, .vb-box {
  width: 200px;
  height: 200px;
}
video {
  width: 100%;
}
</style>