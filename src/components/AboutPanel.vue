<script setup>
// 公告页：站点说明、源码入口、反馈渠道、使用须知。
// 只链接公开的前端仓库；后端仓库私有，不放链接。
const REPO = 'https://github.com/xiaoxiaoyu-123/handwritten-simulation-front-end'
const ISSUES = REPO + '/issues'
</script>

<template>
  <section class="panel about">
    <h2>关于「手写模拟」</h2>
    <p>
      这是一个把<strong>打字的数学作业变成手写样子</strong>的工具：
      在左侧输入（或拍照 / 导入 Word、PDF / 让 AI 解题），
      右侧实时预览手写效果，一键导出成可打印的 PDF 或 PNG。
    </p>
    <ul>
      <li>内置分数、根号、积分上下限、求和、极限等数学记号，导出的是"手写出来"的版式，不是印刷体贴图</li>
      <li>📷 拍题：题目照片让 AI 抄成文字；📄 导入：Word / 文字版 PDF 直接提取（不消耗 AI 次数），扫描版可逐页 AI 识别</li>
      <li>🤖 AI 解题：按本站记号规范写出可渲染的答案，输出过程实时可见，历史会话随时切回查看</li>
      <li>字体工坊：上传自己的 TTF/OTF 字体，自动生成上标字形</li>
    </ul>

    <h2>源码与反馈</h2>
    <p>
      前端仓库已开源：
      <a :href="REPO" target="_blank">{{ REPO }}</a>
    </p>
    <p>
      觉得好用的话，去仓库<strong>点个 ⭐ Star</strong> 就是最大的支持；
      有想优化的地方、发现了 bug，或者想要新功能，都欢迎提 Issue：
      <a :href="ISSUES" target="_blank">提交建议 / 反馈问题</a>。
    </p>

    <h2>使用须知</h2>
    <ul>
      <li>AI 解题由本站内置 Key 提供，<strong>每人每天次数有限</strong>；题文会发送给 AI 服务商，请勿提交涉密或隐私内容</li>
      <li>导出的 PDF / PNG 保存在服务器上，<strong>24 小时后自动删除</strong>；下载链接在这 24 小时内有效</li>
      <li>你的题文与会话只保存在<strong>本机浏览器</strong>里（「清空历史」一键删除）；上传的纸张 / 字体仅本机可见，可随时删除</li>
      <li>AI 可能出错，<strong>导出前务必逐行核对</strong>；本工具仅供个人学习演示，请遵守所在学校 / 机构的学术规范</li>
    </ul>
  </section>
</template>
