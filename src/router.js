import { createRouter, createWebHistory } from 'vue-router'
import WriteView from './views/WriteView.vue'
import LibraryView from './views/LibraryView.vue'
import AnimView from './views/AnimView.vue'
import ForgeView from './views/ForgeView.vue'
import AboutView from './views/AboutView.vue'

// 五页架构（2.0）：写作业 / 题库 / 讲解 / 字体工坊 / 公告
// 题库与讲解为阶段 2/4 的占位壳，先占住信息架构
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/write' },
    { path: '/write', name: 'write', component: WriteView },
    { path: '/library', name: 'library', component: LibraryView },
    { path: '/anim', name: 'anim', component: AnimView },
    { path: '/forge', name: 'forge', component: ForgeView },
    { path: '/about', name: 'about', component: AboutView },
  ],
})
