<script setup lang="ts">
import {getLocalUserMedia, getQueryParams, setDomVideoStream, setRemoteDomVideoStream} from "@/utils";
import {ref, onMounted} from "vue";
import {io, type Socket} from "socket.io-client";
import Danmaku from 'danmaku';
/**
 * 实现一个直播 demo
 * 主播端: http://localhost:5173/dmpage/#?roomId=2016&userId=9999&role=pub&nickname=T
 * 观众端:
 * 1. http://localhost:5173/dmpage/#?roomId=2016&userId=01&nickname=S1
 * 2. http://localhost:5173/dmpage/#?roomId=2016&userId=02&nickname=S2
 * 3. http://localhost:5173/dmpage/#?roomId=2016&userId=03&nickname=S3
 */
// T: 主播 Sx: 观众
const T = '9999'
const S1 = '01'
const S2 = '02'
const S3 = '03'
// 初始化 PC
const pcMap: Map<string, RTCPeerConnection> = new Map()
pcMap.set(`${T}-${S1}`, new RTCPeerConnection())
pcMap.set(`${T}-${S2}`, new RTCPeerConnection())
pcMap.set(`${T}-${S3}`, new RTCPeerConnection())
pcMap.set(`${S1}-${T}`, new RTCPeerConnection())
pcMap.set(`${S2}-${T}`, new RTCPeerConnection())
pcMap.set(`${S3}-${T}`, new RTCPeerConnection())

const userInfo = ref()
let socketClient: Socket
const dataChannelMap = new Map()
let danmaku: Danmaku

const danmuForRoller = (msg) => {
  if(danmaku){
    danmaku.emit({text: msg, style: {fontSize: '20px',color: '#ff5500'}})
  }
}

const initDanmuContainer = () => {
  console.log('初始化弹幕容器')
  if (userInfo.value.role === 'pub') { // 主播
    //增加弹幕组件
    danmaku = new Danmaku({
      container: document.getElementById('pub'),
      speed: 30
    });
  } else { // 观众
    danmaku = new Danmaku({
      container: document.getElementById('sub'),
      speed: 30
    });
  }
  // 首条弹幕
  danmaku.emit({text: '直播间已开启，请踊跃发言', style: {fontSize: '20px',color: '#ff5500'}})
}

const sendMessage = () => {
  /**
   * 如果角色是主播，则获取主播 -> 观众的 channel
   * 如果是观众，则获取观众 -> 主播的 channel
   * 观众和主播，主播和观众都建立了联系；
   * 观众和观众之间没有建立联系，那么观众之间就看不到弹幕:
   *  解决办法: 主播收到观众发来的弹幕之后将其下发给所有观众。
   */
  const T2S = []; // 角色是主播，则获取主播 -> 观众的 channel
  const S2T = []; // 角色是观众，则获取观众 -> 主播的 channel
  for (const [key, value] of dataChannelMap.entries()) {
    if (key.startsWith(`dataChannel-${T}`)) {
      T2S.push(value);
    } else {
      S2T.push(value);
    }
  }
  console.log('T2S', T2S, 'S2T', S2T, userInfo.value.role)
  if (userInfo.value.role === 'pub') {
    for (const channel of T2S.values()) {
      channel.send(`${userInfo.value.userId}: hello`)
    }
  } else {
    for (const channel of S2T.values()) {
      channel.send(`${userInfo.value.userId}: hello`)
    }
  }
}

const createDataChannel = async (pc: RTCPeerConnection, userId: string, targetId: string) => {
  const key = `dataChannel-${userId}-${targetId}`
  const dataChannel = pc.createDataChannel(key)
  console.log('创建 dataChannel', `dataChannel-${userId}-${targetId}`, dataChannel)
  dataChannelMap.set(key, dataChannel)

  // 处理远端数据通道
  pc.ondatachannel = (event) => {
    console.log(`用户 ${userId} 收到 dataChannel`, event)
    event.channel.onopen = () => {
      console.log(`用户 ${userId} dataChannel 打开`)
    }
    event.channel.onmessage = (event) => {
      console.log(`用户 ${userId} 收到消息`, event.data)
      // 弹幕上屏
      danmuForRoller(event.data)
      // 主播收到观众发来的弹幕时，将其下发给所有观众
      if (userInfo.value.role === 'pub') {
        for (const [key, channel] of dataChannelMap.entries()) {
          // 角色是主播，则获取主播 -> 观众的 channel
          if (key.startsWith(`dataChannel-${T}`)) {
            channel.send(event.data)
          }
        }
      }

    }
    event.channel.onclose = () => {
      console.log(`用户 ${userId} dataChannel 关闭`)
    }
  }
  // 处理本地数据通道
  dataChannel.onopen = () => {
    console.log(`用户 ${userId} dataChannel 打开`)
  }
}

const onRemoteAnswer = async (data) => {
  console.log('收到远端 answer')
  const pc = pcMap.get(`${data.targetUid}-${data.userId}`) as RTCPeerConnection
  await pc.setRemoteDescription(data.answer)
}

const onCandidate = async (data) => {
  console.log('收到 candidate')
  let pc: RTCPeerConnection
  pc = pcMap.get(`${data.targetUid}-${data.userId}`) as RTCPeerConnection

  await pc.addIceCandidate(data.candidate)
}

const onRemoteOffer = async (data) => {
  console.log('收到远端 answer')
  const pc = pcMap.get(`${data.targetUid}-${data.userId}`) as RTCPeerConnection
  await pc.setRemoteDescription(data.offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  socketClient.emit('answer', {
    userId: data.targetUid,
    targetUid: data.userId,
    answer
  })
}

// 收到远端呼叫
const onCall = async (data) => {
  console.log('收到呼叫', data)
  const pc = pcMap.get(`${data.targetUid}-${data.userId}`) as RTCPeerConnection

  // 获取本地流，绑定到 pc
  const localStream = await getLocalUserMedia({ video: true, audio: true })
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
  })

  await onPcEvent(pc, data.targetUid, data.userId)
}

const onPcEvent = async (pc: RTCPeerConnection, userId: string, targetId: string) => {
  // 收到 candidate
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socketClient.emit('candidate', {
        userId: userId,
        targetUid: targetId,
        candidate: event.candidate
      })
    } else {
      console.log('candidate 传输完成')
    }
  }
  // 重新协商
  pc.onnegotiationneeded = () => {
    console.log('重新协商')
  }
  // 收到远端流
  pc.ontrack = (event) => {
    console.log('收到远端流', event)
    setRemoteDomVideoStream(`remoteVideo`, event.track)
  }

  await createDataChannel(pc, userId, targetId)
}

const initSocket = async () => {
  socketClient = io('127.0.0.1:18080', {
    reconnectionDelayMax: 10000,
    transports: ['websocket'],
    query: {
      roomId: userInfo.value.roomId,
      userId: userInfo.value.userId,
      nickname: userInfo.value.nickname,
      role: userInfo.value.role
    }
  })
  // 连接成功
  socketClient.on('connect', () => {
    console.log('socket 连接成功')
  })
  // 连接失败
  socketClient.on('connect_error', (error) => {
    console.error('socket 连接失败', error)
  })
  // 收到关于 pc 的消息
  socketClient.on('message', async (message) => {
    console.log('收到消息', message)

    const type = message.type
    const data = message.data

    if (type === 'join' || 'leave') {
      setTimeout(() => {
        socketClient.emit('roomUserList', {
          roomId: userInfo.value.roomId
        })
      })
    }

    if (type === 'call') {
      await onCall(data)
    }

    if (type === 'offer') {
      await onRemoteOffer(data)
    }

    if (type === 'candidate') {
      await onCandidate(data)
    }

    if (type === 'answer') {
      await onRemoteAnswer(data)
    }

  })
  // 收到 roomUserList 信令
  socketClient.on('roomUserList', async (data) => {
    console.log('收到 roomUserList 信令', data)
  })
}

// 获取 URL 参数
const init = () => {
  const roomId = getQueryParams().get('roomId')
  const userId = getQueryParams().get('userId')
  const role = getQueryParams().get('role')
  const nickname = getQueryParams().get('nickname')

  if (!roomId || !userId || !nickname) {
    console.error('参数错误')
    return
  }

  userInfo.value = {
    userId,
    roomId,
    role,
    nickname
  }

  initSocket()

  if (userInfo.value.role === 'pub') {
    initTeacher()
  } else {
    initStudent()
  }

}

/**
 * 初始化主播端(被叫)
 * 将本地视频渲染到页面上
 */
const initTeacher = async () => {
  const localStream = await getLocalUserMedia({ video: true, audio: true })
  await setDomVideoStream('localVideo', localStream)
}

/**
 * 初始化观众端(主叫)
 */
const initStudent = async () => {

  socketClient.emit('call', {
    roomId: userInfo.value.roomId,
    userId: userInfo.value.userId,
    targetUid: T
  })

  // 获取对应 PC
  const pc = pcMap.get(`${userInfo.value.userId}-${T}`) as RTCPeerConnection

  pc.addTransceiver('video', { direction: 'recvonly' })
  pc.addTransceiver('audio', { direction: 'recvonly' })

  await onPcEvent(pc, userInfo.value.userId, T)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  socketClient.emit('offer', {
    userId: userInfo.value.userId,
    targetUid: T,
    offer
  })

}

init()

onMounted(() => {
  initDanmuContainer()
})

</script>

<template>
这里是弹幕页面
  <button @click="sendMessage">发送消息</button>
  <div>
    <div id="pub">
      <video id="localVideo" autoplay playsinline></video>
    </div>
    <div id="sub">
      <video id="remoteVideo" autoplay playsinline></video>
    </div>
  </div>
</template>

<style scoped>
video {
  width: 200px;
  height: 200px;
}
</style>