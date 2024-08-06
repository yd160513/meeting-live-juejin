import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'join',
      component: () => import('../views/meeting/JoinPage.vue')
    },
    {
      path: '/home',
      name: 'home',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/meeting/HomePage.vue')
    },
    {
      path: '/live',
      name: 'live',
      component: () => import('../views/live/LivePage2.vue')
    },
    {
      path: '/vbpage',
      name: 'vbpage',
      component: () => import('../views/virtualBackground/virtualBackgroundPage.vue')
    }
  ]
})

export default router
