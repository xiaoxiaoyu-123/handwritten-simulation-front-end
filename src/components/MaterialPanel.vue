<template>
  <aside class="panel material">
    <h2>纸张</h2>
    <div class="paper-list">
      <label><input type="radio" name="paper" checked /> A4 横线</label>
      <label><input type="radio" name="paper" /> 方格纸</label>
      <label><input type="radio" name="paper" /> 空白页</label>
      <label><input type="radio" name="paper" /> 信纸</label>
      <button class="ghost" disabled>+ 上传我的纸张（P1）</button>
    </div>

    <h2>字体</h2>
    <div class="font-list">
      <label><input type="radio" name="font" checked /> 默认手写体</label>
      <button class="ghost" disabled>+ 上传我的字体（P1）</button>
    </div>

    <h2>参数</h2>
    <div class="params">
      <label>字号 <input type="range" min="28" max="64" value="44" /></label>
      <label>潦草度 <input type="range" min="0" max="10" value="5" /></label>
      <label>墨色 <input type="color" value="#000000" /></label>
    </div>
  </aside>
</template>
