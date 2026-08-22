(function () {
  var el = document.getElementById("typewriter");
  var cursor = document.getElementById("typewriter-cursor");
  if (!el || !cursor) return;

  var phrases = [
    "写代码，也写点字。",
    "Go 后端开发工程师",
    "记录技术与日常思考",
    "欢迎来到我的博客 👋"
  ];

  var i = 0;        // 当前短语索引
  var j = 0;        // 当前字符位置
  var deleting = false;
  var typeSpeed = 80;
  var deleteSpeed = 40;
  var pauseEnd = 2000;
  var pauseStart = 500;

  function type() {
    var phrase = phrases[i];
    if (!deleting) {
      // 打字
      if (j < phrase.length) {
        el.textContent += phrase.charAt(j);
        j++;
        setTimeout(type, typeSpeed);
      } else {
        // 打完，暂停后删除
        deleting = true;
        setTimeout(type, pauseEnd);
      }
    } else {
      // 删除
      if (j > 0) {
        el.textContent = phrase.substring(0, j - 1);
        j--;
        setTimeout(type, deleteSpeed);
      } else {
        // 删完，切下一句
        deleting = false;
        i = (i + 1) % phrases.length;
        setTimeout(type, pauseStart);
      }
    }
  }

  type();
})();