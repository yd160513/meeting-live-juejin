<script setup lang="ts">
/**
 * 老师端: http://localhost:5173/live/#?roomId=2016&userId=9999&role=pub&nickname=T
 * 学生端:
 * 1. http://localhost:5173/live/#?roomId=2016&userId=01&nickname=S1
 * 2. http://localhost:5173/live/#?roomId=2016&userId=02&nickname=S2
 * 3. http://localhost:5173/live/#?roomId=2016&userId=03&nickname=S3
 */

import {io, type Socket} from "socket.io-client";
import {ref} from "vue";
import {getLocalUserMedia, getQueryParams, setDomVideoStream, setRemoteDomVideoStream} from "@/utils";

/**
 * 实现流程:
 * 1. 连接信令服务
 * 2. 初始化 PC
 */
// T 代表老师，S1、S2、S3 代表学生
const T = '9999'
const S1 = '01'
const S2 = '02'
const S3 = '03'
// 老师端数据结构
const tMap: Map<string, RTCPeerConnection> = new Map()
tMap.set(`${T}-${S1}`, new RTCPeerConnection())
tMap.set(`${T}-${S2}`, new RTCPeerConnection())
tMap.set(`${T}-${S3}`, new RTCPeerConnection())
// 学生端数据结构
const sMap: Map<string, RTCPeerConnection> = new Map()
sMap.set(`${S1}-${T}`, new RTCPeerConnection())
sMap.set(`${S2}-${T}`, new RTCPeerConnection())
sMap.set(`${S3}-${T}`, new RTCPeerConnection())

let socketClient: Socket
let currentUserInfo = ref({
  roomId: getQueryParams().get('roomId'),
  userId: getQueryParams().get('userId'),
  role: getQueryParams().get('role'),
  nickname: getQueryParams().get('nickname')
})
let localRtcPc: RTCPeerConnection

console.log('currentUserInfo: ', currentUserInfo.value)

// 收到远端 answer
const onRemoteAnswer = async (data) => {
  await localRtcPc.setRemoteDescription(data.answer)
}

// 收到远端 offer
const onRemoteOffer = async (data) => {
  await localRtcPc.setRemoteDescription(data.offer)
  const answer = await localRtcPc.createAnswer()
  await localRtcPc.setLocalDescription(answer)
  socketClient.emit('answer', {
    userId: data.targetId,
    targetUid: data.userId,
    answer
  })
}

// 收到远端呼叫
const onCall = async (data) => {
  // 获取被叫的 PC
  localRtcPc = tMap.get(`${data.targetUid}-${data.userId}`) as RTCPeerConnection

  const localStream = await getLocalUserMedia({
    video: true,
    audio: true
  })
  for (const track of localStream.getTracks()) {
    localRtcPc.addTrack(track)
  }

  await onPcEvent(localRtcPc, data.targetUid, data.userId)
}

const onPcEvent = async (pc: RTCPeerConnection, userId: string, targetId: string) => {
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketClient.emit('candidate', {
        userId,
        targetUid: targetId,
        candidate: event.candidate
      })
    } else {
      console.log('onicecandidate end')
    }
  }
  // 重新协商
  pc.onnegotiationneeded = (event) => {
    console.log('onnegotiationneeded 重新协商', event)
  }
  // 远端流到达
  pc.ontrack = (event) => {
    console.log('ontrack 远端流到达', event)
    setRemoteDomVideoStream('teacher-video', event.track)
  }
}

/**
 * 这个 demo 中学生永远是主叫，老师永远是被叫。所以，初始化学生端的时候进行呼叫老师端
 */
const initStudent = async () => {
  console.log('初始化学生端')

  if (!currentUserInfo.value.userId) {
    console.error('userId 不能为空')
    return
  }

  // 学生端的 PC 已经在上边初始化了，这里直接获取即可
  localRtcPc = sMap.get(`${currentUserInfo.value.userId}-${T}`) as RTCPeerConnection

  localRtcPc.addTransceiver("audio", {direction: "recvonly"});
  localRtcPc.addTransceiver("video", {direction: "recvonly"});

  await onPcEvent(localRtcPc, currentUserInfo.value.userId, T)

  const offer = await localRtcPc.createOffer()
  await localRtcPc.setLocalDescription(offer)

  socketClient.emit('offer', {
    userId: currentUserInfo.value.userId,
    targetUid: T,
    offer
  })
}

const initTeacher = async () => {
  console.log('初始化老师端')

  const constraints = {
    video: true,
    audio: true
  }
  // 获取本地媒体流，将其渲染到 video 上
  const localStream = await getLocalUserMedia(constraints)
  await setDomVideoStream('teacher-video', localStream)
}

const init = () => {
  initSocket()

  if (currentUserInfo.value.role === 'pub') {
    initTeacher()
  } else {

    socketClient.emit('call', {
      userId: currentUserInfo.value.userId,
      roomId: currentUserInfo.value.roomId,
      targetUid: T
    })

    initStudent()
  }
}

const initSocket = () => {
  socketClient = io("http://localhost:18080", {
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    query: {
      roomId: currentUserInfo.value.roomId,
      userId: currentUserInfo.value.userId,
      role: currentUserInfo.value.role,
      nickname: currentUserInfo.value.nickname
    }
  })

  socketClient.on('message', (message) => {
    console.log('socket message', message)
    const type = message.type

    if (type === 'join' || type === 'leave') {
      setTimeout(() => {
        socketClient.emit('roomUserList', {roomId: currentUserInfo.value.roomId})
      }, 1000)
    }

    if (type === 'call') {
      console.log('socket call', message)
      onCall(message.data)
    }

    if (type === 'offer') {
      console.log('socket offer', message)
      onRemoteOffer(message.data)
    }

    if (type === 'answer') {
      console.log('socket answer', message)
      onRemoteAnswer(message.data)
    }

    if (type === 'candidate') {
      console.log('socket candidate', message)
      localRtcPc.addIceCandidate(message.data.candidate)
    }

  })

  socketClient.on('roomUserList', (data) => {
    console.log('socket roomUserList', data)
  })

  socketClient.on('connect', () => {
    console.log('socket connect')
  })

  socketClient.on('connect_error', (error) => {
    console.log('socket connect_error', error)
  })

  socketClient.on('disconnect', () => {
    console.log('socket disconnect')
  })

  socketClient.on('error', (error) => {
    console.log('socket error', error)
  })
}

init()

</script>

<template>
<div class="live-content">
  <div class="teacher-content">
    老师端
    <video id="teacher-video" muted autoplay playsinline></video>
  </div>
  <div class="student-content">
    学生端
    <video id="student-video" muted autoplay playsinline></video>
  </div>
</div>
</template>

<style scoped>
.teacher-content, .student-content {
  width: 200px;
  height: 200px;
}
video {
  width: 100%;
}
</style>