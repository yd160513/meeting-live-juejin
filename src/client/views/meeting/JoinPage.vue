<script setup lang="ts">
import { ref } from 'vue'
import type { FormRules, FormInstance } from 'element-plus'
import { getQueryParams } from '@/utils'
import router from "@/router";

interface RuleForm {
  roomId: string
  userId: string
}

const joinFormRules = ref<FormRules<RuleForm>>({
  roomId: [
    {required: true, message: '请输入房间号', trigger: 'blur'},
  ],
  userId: [
    {required: true, message: '请输入用户编号', trigger: 'blur'},
  ],
})

const joinFormRef = ref<FormInstance>()

// do not use same name with ref
const joinForm = ref({
  roomId: getQueryParams().get('roomId') || '2016',
  userId: getQueryParams().get('userId') || `513-${Date.now()}`,
})

const joinHandler = async (formEl: FormInstance | undefined) => {
  console.log('join!')
  if (!formEl) return
  console.log('join validate!')
  await formEl.validate((valid, fields) => {
    if (valid) {
      console.log('join end!')
      router.push({
        name: 'home',
        query: {
          roomId: joinForm.value.roomId,
          userId: joinForm.value.userId,
        }
      })
    } else {
      console.log('error join!', fields)
    }
  })
}
</script>

<template>
  <div class="join-page">
    <el-form class="join-form" ref="joinFormRef" :model="joinForm" :rules="joinFormRules"  label-width="auto">
      <el-form-item label="房间号" prop="roomId">
        <el-input v-model="joinForm.roomId" />
      </el-form-item>
      <el-form-item label="用户编号" prop="userId">
        <el-input v-model="joinForm.userId" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="joinHandler(joinFormRef)">加入</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.join-page {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
.join-form {
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
