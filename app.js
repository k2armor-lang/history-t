/* =========================================================
   역사 여행 계획 세우기 — 뼈대 (네비게이션 + 자동저장)
   외부 라이브러리 없이 순수 JS로만 동작합니다.
   ========================================================= */
(function () {
  "use strict";

  var STORAGE_KEY = "history-trip-v1"; // localStorage 저장 키

  // ----- 자주 쓰는 요소 미리 잡아두기 -----
  var screens = Array.prototype.slice.call(document.querySelectorAll(".screen"));
  var progressEl = document.getElementById("progress");
  var progressText = document.getElementById("progressText");
  var stepName = document.getElementById("stepName");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");

  var total = screens.length; // 7
  var current = 0;            // 현재 섹션 번호(0부터)

  // 화면에 저장/복원할 데이터. 자유 확장 가능.
  var data = {
    step: 0,
    studentId: "",
    name: "",
    destination: "",
    destinationReason: "",   // 여행지를 고른 이유
    theme: "",
    timeline: [],                     // [{ year, event }]
    schedule: { day1: [], day2: [] }, // 각 항목 { place, time, meaning, photo }
    food: [],                         // [{ name, menu, review, photo }]

    // 예산: 인원수 + 카테고리별 세부 항목 목록
    // 각 항목 { detail(세부 내용), amount(금액) }
    budget: {
      people: "",
      cats: {
        transport: [{ detail: "", amount: "" }],
        admission: [{ detail: "", amount: "" }],
        food: [{ detail: "", amount: "" }],
        lodging: [],
        etc: []
      }
    }
  };

  // 예산 카테고리 정의 (섹션 순서·세부 입력칸 라벨·안내문)
  var BUDGET_CATS = [
    { key: "transport", title: "교통",  detailLabel: "교통편", ph: "예: KTX 왕복 / 시내버스" },
    { key: "admission", title: "입장료", detailLabel: "장소",  ph: "예: 불국사 / 석굴암" },
    { key: "food",      title: "식비",  detailLabel: "메뉴",  ph: "예: 비빔밥 / 황남빵" },
    { key: "lodging",   title: "숙박",  detailLabel: "숙소",  ph: "예: 게스트하우스 1박" },
    { key: "etc",       title: "기타",  detailLabel: "내용",  ph: "예: 기념품 / 간식" }
  ];

  var activeDay = "day1";             // 일정표에서 현재 보고 있는 탭

  /* ========== localStorage: 안전한 저장/불러오기 ========== */
  function saveData() {
    // 저장이 막혀도(사생활 보호 모드·용량 초과 등) 페이지가 멈추지 않도록 try/catch
    // 반환값: 저장 성공 여부(사진 첨부 시 용량 초과를 알리는 데 사용)
    try {
      data.step = current;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        // 알고 있는 키만 병합(예상치 못한 값 방지)
        for (var key in data) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            data[key] = parsed[key];
          }
        }
      }
    } catch (e) {
      // 불러오기 실패 시 기본값으로 시작
    }
    normalizeData();
  }

  // 저장된 데이터가 예상 형태가 아닐 때(구버전 등) 안전하게 보정
  function normalizeData() {
    if (!Array.isArray(data.timeline)) data.timeline = [];
    if (!Array.isArray(data.food)) data.food = [];
    if (!data.schedule || typeof data.schedule !== "object") {
      data.schedule = { day1: [], day2: [] };
    }
    if (!Array.isArray(data.schedule.day1)) data.schedule.day1 = [];
    if (!Array.isArray(data.schedule.day2)) data.schedule.day2 = [];

    // 사진 필드가 없던 구버전 데이터 보정 (photo 문자열 보장)
    data.food.forEach(function (f) { if (typeof f.photo !== "string") f.photo = ""; });
    data.schedule.day1.concat(data.schedule.day2).forEach(function (c) {
      if (typeof c.photo !== "string") c.photo = "";
    });

    // 예산: 인원수 + 카테고리별 항목
    if (!data.budget || typeof data.budget !== "object") data.budget = {};
    if (typeof data.budget.people !== "string") {
      data.budget.people = data.budget.people == null ? "" : String(data.budget.people);
    }
    if (!data.budget.cats || typeof data.budget.cats !== "object") data.budget.cats = {};
    BUDGET_CATS.forEach(function (cat) {
      var arr = data.budget.cats[cat.key];
      if (!Array.isArray(arr)) arr = [];
      data.budget.cats[cat.key] = arr
        .filter(function (x) { return x && typeof x === "object"; })
        .map(function (x) {
          return {
            detail: typeof x.detail === "string" ? x.detail : "",
            amount: typeof x.amount === "string" ? x.amount : (x.amount == null ? "" : String(x.amount))
          };
        });
    });
    if (data.budget.items) delete data.budget.items; // 옛 버전 구조 제거
  }

  /* ========== 화면 전환 ========== */
  function showScreen(index) {
    // 범위 보정
    if (index < 0) index = 0;
    if (index > total - 1) index = total - 1;
    current = index;

    for (var i = 0; i < screens.length; i++) {
      screens[i].hidden = (i !== current);
    }

    updateProgress();
    updateNavButtons();

    // 이제 보이는 화면의 텍스트 상자를 내용에 맞게 확장(숨겨졌을 땐 높이가 0이라 여기서 다시 계산)
    growTextareas(screens[current]);

    // 완성본 화면이면 최신 데이터로 요약·체크 다시 그림
    if (current === total - 1) renderCompletion();

    saveData();

    // 새 섹션은 위에서부터 보이도록 스크롤 초기화
    var main = document.getElementById("main");
    if (main) main.scrollTop = 0;
  }

  function updateProgress() {
    // 진행 점 다시 그리기
    progressEl.innerHTML = "";
    for (var i = 0; i < total; i++) {
      var dot = document.createElement("span");
      dot.className = "progress-dot";
      if (i === current) dot.className += " active";
      else if (i < current) dot.className += " done";
      progressEl.appendChild(dot);
    }
    progressText.textContent = (current + 1) + " / " + total;

    var title = screens[current].getAttribute("data-title") || "";
    stepName.textContent = title;
  }

  function updateNavButtons() {
    prevBtn.disabled = (current === 0);
    // 마지막 섹션에서는 '다음' 버튼을 '완료' 느낌으로 비활성화
    nextBtn.disabled = (current === total - 1);
  }

  /* ========== 입력값 복원(화면에 반영) ========== */
  function restoreInputs() {
    // 텍스트 입력
    var inputs = document.querySelectorAll("[data-save]");
    for (var i = 0; i < inputs.length; i++) {
      var field = inputs[i].getAttribute("data-save");
      if (field in data && data[field] != null) {
        inputs[i].value = data[field];
      }
    }
    // 여행지는 자유 입력(위 data-save 루프에서 복원됨), 테마는 선택 버튼
    highlightChoice("theme", data.theme);
    // 동적 리스트(타임라인·일정·맛집) 다시 그리기
    renderLists();
  }

  function highlightChoice(group, value) {
    var container = document.querySelector('[data-choice="' + group + '"]');
    if (!container) return;
    var btns = container.querySelectorAll(".choice-btn");
    for (var i = 0; i < btns.length; i++) {
      var isSel = (btns[i].getAttribute("data-value") === value);
      btns[i].classList.toggle("selected", isSel);
    }
  }

  /* ========== 동적 리스트(타임라인·일정·맛집) ========== */

  // 라벨 + 입력칸(한 칸) 만들기
  function makeField(labelText, value, attrs, multiline) {
    var wrap = document.createElement("label");
    wrap.className = "field mini";
    var span = document.createElement("span");
    span.className = "field-label";
    span.textContent = labelText;
    var input = multiline ? document.createElement("textarea") : document.createElement("input");
    if (!multiline) input.type = "text";
    input.className = "text-input";
    input.value = value || "";
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) input.setAttribute(k, attrs[k]);
    }
    wrap.appendChild(span);
    wrap.appendChild(input);
    return wrap;
  }

  // 텍스트 상자(textarea)를 내용 길이에 맞춰 자동으로 늘림
  function autoGrow(el) {
    if (!el) return;
    // 숨겨진 화면이면 높이 계산이 0이 되므로 건너뜀(표시될 때 다시 계산)
    if (el.offsetParent === null) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }

  // 컨테이너 안의 모든 textarea를 한꺼번에 자동 확장
  function growTextareas(container) {
    if (!container || !container.querySelectorAll) return;
    var tas = container.querySelectorAll("textarea");
    for (var i = 0; i < tas.length; i++) autoGrow(tas[i]);
  }

  // "아직 없어요" 안내 문구
  function emptyMsg(text) {
    var p = document.createElement("p");
    p.className = "empty-msg";
    p.textContent = text;
    return p;
  }

  // 삭제 버튼
  function delButton(attrs) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "del-btn";
    b.textContent = "삭제";
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) b.setAttribute(k, attrs[k]);
    }
    return b;
  }

  // 사진 첨부 영역 만들기 (맛집·방문지 공용)
  // kind: "food" | "schedule", attrs: 삭제/첨부 버튼에 붙일 data-*
  function photoField(photoData, dataAttrs) {
    var box = document.createElement("div");
    box.className = "photo-box";

    if (photoData) {
      var img = document.createElement("img");
      img.className = "photo-thumb";
      img.src = photoData;
      img.alt = "첨부한 사진";
      box.appendChild(img);

      var del = document.createElement("button");
      del.type = "button";
      del.className = "photo-del";
      del.textContent = "사진 삭제";
      for (var k in dataAttrs) {
        if (Object.prototype.hasOwnProperty.call(dataAttrs, k)) del.setAttribute(k, dataAttrs[k]);
      }
      box.appendChild(del);
    } else {
      // 파일 입력을 감싼 라벨을 버튼처럼 보이게
      var label = document.createElement("label");
      label.className = "photo-btn";
      label.textContent = "📷 사진 첨부";
      var file = document.createElement("input");
      file.type = "file";
      file.accept = "image/*";
      file.className = "photo-file";
      for (var k2 in dataAttrs) {
        if (Object.prototype.hasOwnProperty.call(dataAttrs, k2)) file.setAttribute(k2, dataAttrs[k2]);
      }
      label.appendChild(file);
      box.appendChild(label);
    }
    return box;
  }

  // 사진을 캔버스로 축소·압축해 data URL로 반환 (localStorage 용량 절약)
  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var maxDim = 1000; // 긴 변 기준 최대 1000px
        var w = img.width, h = img.height;
        if (w >= h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h > w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        try {
          var canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          cb(canvas.toDataURL("image/jpeg", 0.7));
        } catch (err) { cb(null); }
      };
      img.onerror = function () { cb(null); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  // 항목(맛집/방문지)에 사진 저장. 실패(용량 초과 등)면 되돌리고 안내
  function setItemPhoto(kind, day, index, dataUrl) {
    var item = (kind === "schedule") ? (data.schedule[day] && data.schedule[day][index])
      : (data.food && data.food[index]);
    if (!item) return;

    var prev = item.photo || "";
    item.photo = dataUrl || "";
    var ok = saveData();
    if (!ok) {
      // 저장 실패 → 사진 되돌리고 사용자에게 알림
      item.photo = prev;
      saveData();
      alert("사진을 저장할 공간이 부족해요. 이미 넣은 사진을 줄이거나, 더 작은 사진을 사용해주세요.");
    }
    if (kind === "schedule") renderSchedule(); else renderFood();
  }

  // 파일 선택(change) 처리
  function handlePhotoInput(fileInput) {
    var file = fileInput.files && fileInput.files[0];
    if (!file) return;
    var kind = fileInput.getAttribute("data-photo");
    var day = fileInput.getAttribute("data-day");
    var index = parseInt(fileInput.getAttribute("data-index"), 10);
    if (isNaN(index)) return;
    compressImage(file, function (dataUrl) {
      if (!dataUrl) { alert("사진을 불러오지 못했어요. 다른 사진을 시도해주세요."); return; }
      setItemPhoto(kind, day, index, dataUrl);
    });
  }

  // 사진 삭제 처리
  function handlePhotoDelete(btn) {
    var kind = btn.getAttribute("data-photo");
    var day = btn.getAttribute("data-day");
    var index = parseInt(btn.getAttribute("data-index"), 10);
    if (isNaN(index)) return;
    setItemPhoto(kind, day, index, "");
  }

  // '역사적 의미'가 비어 있으면 눈에 띄게 표시
  function applyMeaningState(input) {
    var wrap = input.closest(".field");
    var empty = !input.value.trim();
    input.classList.toggle("is-empty", empty);
    if (wrap) wrap.classList.toggle("show-warn", empty);
  }

  // --- 타임라인 ---
  function renderTimeline() {
    var listEl = document.getElementById("timelineList");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (data.timeline.length === 0) {
      listEl.appendChild(emptyMsg("아직 없어요. 아래 버튼으로 사건을 추가해보세요."));
      return;
    }
    data.timeline.forEach(function (item, i) {
      var card = document.createElement("div");
      card.className = "card";
      var row = document.createElement("div");
      row.className = "card-row row-timeline";
      row.appendChild(makeField("연도", item.year, {
        "data-list": "timeline", "data-index": i, "data-field": "year",
        "inputmode": "numeric", "placeholder": "예: 676"
      }));
      row.appendChild(makeField("사건", item.event, {
        "data-list": "timeline", "data-index": i, "data-field": "event",
        "placeholder": "무슨 일이 있었나요?"
      }, true));
      card.appendChild(row);
      card.appendChild(delButton({ "data-list": "timeline", "data-index": i }));
      listEl.appendChild(card);
    });
    growTextareas(listEl);
  }

  // --- 일정표 ---
  function renderSchedule() {
    // 탭 활성화 표시
    var tabs = document.querySelectorAll("#scheduleTabs .tab-btn");
    for (var t = 0; t < tabs.length; t++) {
      tabs[t].classList.toggle("active", tabs[t].getAttribute("data-day") === activeDay);
    }

    var listEl = document.getElementById("scheduleList");
    if (!listEl) return;
    listEl.innerHTML = "";
    var items = data.schedule[activeDay];
    if (items.length === 0) {
      listEl.appendChild(emptyMsg("아직 없어요. 이 날짜의 방문지를 추가해보세요."));
      return;
    }
    items.forEach(function (item, i) {
      var card = document.createElement("div");
      card.className = "card";

      var row = document.createElement("div");
      row.className = "card-row row-schedule";
      row.appendChild(makeField("장소명", item.place, {
        "data-list": "schedule", "data-day": activeDay, "data-index": i, "data-field": "place",
        "placeholder": "예: 불국사"
      }));
      row.appendChild(makeField("방문 시간", item.time, {
        "data-list": "schedule", "data-day": activeDay, "data-index": i, "data-field": "time",
        "placeholder": "예: 10:00"
      }));
      card.appendChild(row);

      // 역사적 의미(핵심) — 비어 있으면 경고
      var meaningWrap = makeField("역사적 의미 ★", item.meaning, {
        "data-list": "schedule", "data-day": activeDay, "data-index": i, "data-field": "meaning",
        "placeholder": "이 장소가 왜 역사적으로 중요한가요?"
      }, true);
      var mInput = meaningWrap.querySelector("textarea");
      mInput.classList.add("meaning-input");
      var note = document.createElement("p");
      note.className = "meaning-note";
      note.textContent = "⚠ 역사적 의미를 꼭 채워주세요!";
      meaningWrap.appendChild(note);
      card.appendChild(meaningWrap);
      applyMeaningState(mInput);

      // 사진 첨부
      card.appendChild(photoField(item.photo, {
        "data-photo": "schedule", "data-day": activeDay, "data-index": i
      }));

      card.appendChild(delButton({
        "data-list": "schedule", "data-day": activeDay, "data-index": i
      }));
      listEl.appendChild(card);
    });
    growTextareas(listEl);
  }

  // --- 맛집 ---
  function renderFood() {
    var listEl = document.getElementById("foodList");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (data.food.length === 0) {
      listEl.appendChild(emptyMsg("아직 없어요. 아래 버튼으로 맛집을 추가해보세요."));
      return;
    }
    data.food.forEach(function (item, i) {
      var card = document.createElement("div");
      card.className = "card";
      card.appendChild(makeField("가게 이름", item.name, {
        "data-list": "food", "data-index": i, "data-field": "name",
        "placeholder": "예: 황남빵집"
      }));
      card.appendChild(makeField("대표 메뉴", item.menu, {
        "data-list": "food", "data-index": i, "data-field": "menu",
        "placeholder": "예: 황남빵"
      }));
      card.appendChild(makeField("한줄평", item.review, {
        "data-list": "food", "data-index": i, "data-field": "review",
        "placeholder": "먹어보고 싶은 이유는?"
      }, true));

      // 사진 첨부
      card.appendChild(photoField(item.photo, {
        "data-photo": "food", "data-index": i
      }));

      card.appendChild(delButton({ "data-list": "food", "data-index": i }));
      listEl.appendChild(card);
    });
    growTextareas(listEl);
  }

  // 리스트 항목 입력 시 데이터에 반영 + 저장 (재렌더 없이 → 입력 포커스 유지)
  function handleListInput(t) {
    var list = t.getAttribute("data-list");
    var index = parseInt(t.getAttribute("data-index"), 10);
    var field = t.getAttribute("data-field");
    if (isNaN(index)) return;

    if (list === "schedule") {
      var day = t.getAttribute("data-day");
      if (!data.schedule[day] || !data.schedule[day][index]) return;
      data.schedule[day][index][field] = t.value;
      if (field === "meaning") applyMeaningState(t);
    } else {
      if (!data[list] || !data[list][index]) return;
      data[list][index][field] = t.value;
    }
    saveData();
  }

  // 항목 추가
  function handleAdd(list) {
    if (list === "timeline") {
      data.timeline.push({ year: "", event: "" });
      renderTimeline();
    } else if (list === "schedule") {
      data.schedule[activeDay].push({ place: "", time: "", meaning: "", photo: "" });
      renderSchedule();
    } else if (list === "food") {
      data.food.push({ name: "", menu: "", review: "", photo: "" });
      renderFood();
    }
    saveData();
    focusLastCard(list);
  }

  // 항목 삭제
  function handleDelete(btn) {
    var list = btn.getAttribute("data-list");
    var index = parseInt(btn.getAttribute("data-index"), 10);
    if (isNaN(index)) return;

    if (list === "schedule") {
      var day = btn.getAttribute("data-day");
      data.schedule[day].splice(index, 1);
      renderSchedule();
    } else {
      data[list].splice(index, 1);
      if (list === "timeline") renderTimeline();
      else if (list === "food") renderFood();
    }
    saveData();
  }

  // 추가 직후 새 카드의 첫 입력칸으로 포커스
  function focusLastCard(list) {
    var id = list === "timeline" ? "timelineList"
      : list === "schedule" ? "scheduleList" : "foodList";
    var listEl = document.getElementById(id);
    if (!listEl) return;
    var cards = listEl.querySelectorAll(".card");
    if (!cards.length) return;
    var input = cards[cards.length - 1].querySelector(".text-input");
    if (input) input.focus();
  }

  /* ========== 예산 계산기 ========== */

  // 문자열에서 숫자만 남기기 (숫자 아닌 입력은 무시)
  function onlyDigits(v) {
    return String(v).replace(/[^0-9]/g, "");
  }

  // 문자열 → 정수 (빈 값/이상값은 0)
  function toNumber(v) {
    var n = parseInt(onlyDigits(v), 10);
    return isNaN(n) ? 0 : n;
  }

  // 1000 → "1,000원"
  function formatWon(n) {
    return n.toLocaleString("ko-KR") + "원";
  }

  function renderBudget() {
    var listEl = document.getElementById("budgetList");
    if (!listEl) return;
    listEl.innerHTML = "";

    // 카테고리(교통·입장료·식비·숙박·기타)별 섹션
    BUDGET_CATS.forEach(function (cat) {
      var rows = data.budget.cats[cat.key];

      var section = document.createElement("div");
      section.className = "budget-cat";

      var head = document.createElement("div");
      head.className = "budget-cat-head";
      var h = document.createElement("h3");
      h.className = "budget-cat-title";
      h.textContent = cat.title;
      var sub = document.createElement("span");
      sub.className = "budget-cat-sub";
      sub.setAttribute("id", "subtotal-" + cat.key);
      head.appendChild(h);
      head.appendChild(sub);
      section.appendChild(head);

      if (rows.length === 0) {
        var em = document.createElement("p");
        em.className = "budget-empty";
        em.textContent = "아직 없어요. 아래 버튼으로 추가하세요.";
        section.appendChild(em);
      } else {
        rows.forEach(function (item, i) {
          var row = document.createElement("div");
          row.className = "budget-row";
          row.appendChild(makeField(cat.detailLabel, item.detail, {
            "data-budget-cat": cat.key, "data-index": i, "data-budget-field": "detail",
            "placeholder": cat.ph
          }));
          row.appendChild(makeField("금액(원)", item.amount, {
            "data-budget-cat": cat.key, "data-index": i, "data-budget-field": "amount",
            "inputmode": "numeric", "placeholder": "0"
          }));
          var del = document.createElement("button");
          del.type = "button";
          del.className = "del-btn budget-del";
          del.textContent = "삭제";
          del.setAttribute("data-del-cat", cat.key);
          del.setAttribute("data-index", i);
          row.appendChild(del);
          section.appendChild(row);
        });
      }

      var add = document.createElement("button");
      add.type = "button";
      add.className = "add-btn budget-add";
      add.textContent = "＋ " + cat.title + " 추가";
      add.setAttribute("data-add-cat", cat.key);
      section.appendChild(add);

      listEl.appendChild(section);
    });

    // 인원수 입력칸 값 반영
    var peopleEl = document.getElementById("budgetPeople");
    if (peopleEl) peopleEl.value = data.budget.people;

    updateBudgetTotals();
  }

  // 총합·카테고리별 소계·1인당 금액 계산 (입력할 때마다 호출 — 재렌더 없이 숫자만 갱신)
  function updateBudgetTotals() {
    var total = 0;
    BUDGET_CATS.forEach(function (cat) {
      var sub = data.budget.cats[cat.key].reduce(function (s, item) {
        return s + toNumber(item.amount);
      }, 0);
      total += sub;
      var subEl = document.getElementById("subtotal-" + cat.key);
      if (subEl) subEl.textContent = sub > 0 ? ("소계 " + formatWon(sub)) : "";
    });

    var people = toNumber(data.budget.people);
    var totalEl = document.getElementById("budgetTotal");
    var perEl = document.getElementById("budgetPer");
    if (totalEl) totalEl.textContent = formatWon(total);
    if (perEl) {
      perEl.textContent = people > 0 ? formatWon(Math.round(total / people)) : "인원수 입력";
    }
  }

  // 예산 입력 처리 (인원수 / 카테고리 항목의 세부·금액)
  function handleBudgetInput(t) {
    var field = t.getAttribute("data-budget-field");

    if (field === "people") {
      t.value = onlyDigits(t.value);      // 숫자만 허용
      data.budget.people = t.value;
    } else {
      var cat = t.getAttribute("data-budget-cat");
      var index = parseInt(t.getAttribute("data-index"), 10);
      if (!cat || isNaN(index) || !data.budget.cats[cat] || !data.budget.cats[cat][index]) return;
      if (field === "amount") t.value = onlyDigits(t.value); // 금액은 숫자만
      data.budget.cats[cat][index][field] = t.value;
    }
    updateBudgetTotals();
    saveData();
  }

  // 예산 카테고리 항목 추가
  function addBudgetItem(key) {
    if (!data.budget.cats[key]) return;
    data.budget.cats[key].push({ detail: "", amount: "" });
    renderBudget();
    saveData();
    // 새로 추가된 세부 입력칸으로 포커스
    var inputs = document.querySelectorAll(
      '[data-budget-cat="' + key + '"][data-budget-field="detail"]'
    );
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  // 예산 카테고리 항목 삭제
  function deleteBudgetItem(key, indexStr) {
    var index = parseInt(indexStr, 10);
    if (!data.budget.cats[key] || isNaN(index)) return;
    data.budget.cats[key].splice(index, 1);
    renderBudget();
    saveData();
  }

  /* ========== 완성본 (요약 · 체크 · 제출) ========== */

  // 완성본 화면에 들어올 때마다 최신 데이터로 다시 그림
  function renderCompletion() {
    renderChecklist();
    renderSummary();
  }

  // 섹션 래퍼: 번호 + 제목 + 본문(비어 있으면 안내)
  function docSection(no, title, bodyEl, isEmpty) {
    var sec = document.createElement("section");
    sec.className = "doc-sec";
    var h = document.createElement("h3");
    h.className = "doc-sec-title";
    var num = document.createElement("span");
    num.className = "sec-no";
    num.textContent = no;
    h.appendChild(num);
    h.appendChild(document.createTextNode(title));
    sec.appendChild(h);
    if (isEmpty || !bodyEl) {
      var em = document.createElement("p");
      em.className = "doc-empty";
      em.textContent = "아직 작성하지 않았어요.";
      sec.appendChild(em);
    } else {
      sec.appendChild(bodyEl);
    }
    return sec;
  }

  // 표지용 메타 배지 (라벨 + 값)
  function metaChip(label, value) {
    var s = document.createElement("span");
    s.className = "meta-chip";
    var b = document.createElement("b");
    b.textContent = label;
    s.appendChild(b);
    s.appendChild(document.createTextNode(" " + value));
    return s;
  }

  function renderSummary() {
    var view = document.getElementById("summaryView");
    if (!view) return;
    view.innerHTML = "";

    // 총예산(표지 배지에 사용)
    var grandTotal = 0;
    BUDGET_CATS.forEach(function (cat) {
      data.budget.cats[cat.key].forEach(function (it) { grandTotal += toNumber(it.amount); });
    });
    var people = toNumber(data.budget.people);

    // --- 표지 ---
    var cover = document.createElement("div");
    cover.className = "doc-cover";
    var kicker = document.createElement("div");
    kicker.className = "doc-kicker";
    kicker.textContent = "역사 여행 계획서";
    cover.appendChild(kicker);
    var title = document.createElement("h2");
    title.className = "doc-title";
    title.textContent = data.destination.trim() || "여행지 미정";
    cover.appendChild(title);
    var meta = document.createElement("div");
    meta.className = "doc-meta";
    meta.appendChild(metaChip("학번", data.studentId.trim() || "-"));
    meta.appendChild(metaChip("이름", data.name.trim() || "-"));
    meta.appendChild(metaChip("테마", data.theme || "-"));
    if (people > 0) meta.appendChild(metaChip("인원", people + "명"));
    if (grandTotal > 0) meta.appendChild(metaChip("총예산", formatWon(grandTotal)));
    cover.appendChild(meta);
    // 여행지를 고른 이유 (있을 때만)
    if (data.destinationReason.trim()) {
      var reason = document.createElement("p");
      reason.className = "doc-reason";
      reason.textContent = "“" + data.destinationReason.trim() + "”";
      cover.appendChild(reason);
    }
    view.appendChild(cover);

    // --- 본문 섹션 ---
    view.appendChild(renderTimelineDoc());
    view.appendChild(renderScheduleDoc());
    view.appendChild(renderFoodDoc());
    view.appendChild(renderBudgetDoc(grandTotal, people));

    // 저작권 (완성본·PDF 하단)
    var credit = document.createElement("p");
    credit.className = "doc-credit";
    credit.textContent = "ⓒ 2026 고운고등학교 교사 이수훈 · 수훈쌤과 함께하는 역사 여행 계획 세우기";
    view.appendChild(credit);
  }

  // 01 역사 타임라인 — 세로 연표
  function renderTimelineDoc() {
    var rows = data.timeline.filter(function (t) { return t.year.trim() || t.event.trim(); });
    if (rows.length === 0) return docSection("01", "역사 타임라인", null, true);
    var ol = document.createElement("ol");
    ol.className = "tl";
    rows.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "tl-item";
      var y = document.createElement("span");
      y.className = "tl-year";
      y.textContent = t.year.trim() || "?";
      var e = document.createElement("span");
      e.className = "tl-event";
      e.textContent = t.event.trim() || "-";
      li.appendChild(y);
      li.appendChild(e);
      ol.appendChild(li);
    });
    return docSection("01", "역사 타임라인", ol);
  }

  // 요약용 사진 썸네일
  function sumPhoto(photoData) {
    var img = document.createElement("img");
    img.className = "sum-photo";
    img.src = photoData;
    img.alt = "첨부한 사진";
    return img;
  }

  // 02 일정표 — 날짜별 방문지 카드
  function renderScheduleDoc() {
    var days = [["day1", "1일차"], ["day2", "2일차"]].filter(function (p) {
      return data.schedule[p[0]].length > 0;
    });
    if (days.length === 0) return docSection("02", "일정표", null, true);

    var wrap = document.createElement("div");
    days.forEach(function (pair) {
      var group = document.createElement("div");
      group.className = "day-group";
      var tag = document.createElement("div");
      tag.className = "day-tag";
      tag.textContent = pair[1];
      group.appendChild(tag);

      data.schedule[pair[0]].forEach(function (c) {
        var stop = document.createElement("div");
        stop.className = "stop";
        var time = document.createElement("span");
        time.className = "stop-time";
        time.textContent = c.time.trim() || "–";
        var body = document.createElement("div");
        body.className = "stop-body";
        var place = document.createElement("div");
        place.className = "stop-place";
        place.textContent = c.place.trim() || "장소 미정";
        body.appendChild(place);
        var mean = document.createElement("div");
        mean.className = "stop-mean";
        if (c.meaning.trim()) {
          mean.textContent = c.meaning.trim();
        } else {
          mean.textContent = "역사적 의미 미작성";
          mean.classList.add("sum-missing");
        }
        body.appendChild(mean);
        stop.appendChild(time);
        stop.appendChild(body);
        if (c.photo) stop.appendChild(sumPhoto(c.photo));
        group.appendChild(stop);
      });
      wrap.appendChild(group);
    });
    return docSection("02", "일정표", wrap);
  }

  // 03 맛집 — 카드
  function renderFoodDoc() {
    var rows = data.food.filter(function (f) {
      return f.name.trim() || f.menu.trim() || f.review.trim() || f.photo;
    });
    if (rows.length === 0) return docSection("03", "맛집", null, true);

    var grid = document.createElement("div");
    grid.className = "food-grid";
    rows.forEach(function (f) {
      var card = document.createElement("div");
      card.className = "food-card";
      var name = document.createElement("div");
      name.className = "food-name";
      name.textContent = f.name.trim() || "맛집";
      card.appendChild(name);
      if (f.menu.trim()) {
        var menu = document.createElement("div");
        menu.className = "food-menu";
        menu.textContent = f.menu.trim();
        card.appendChild(menu);
      }
      if (f.review.trim()) {
        var rv = document.createElement("div");
        rv.className = "food-review";
        rv.textContent = f.review.trim();
        card.appendChild(rv);
      }
      if (f.photo) card.appendChild(sumPhoto(f.photo));
      grid.appendChild(card);
    });
    return docSection("03", "맛집", grid);
  }

  // 04 예산 — 표(카테고리 소계 + 항목 + 총합/1인당)
  function renderBudgetDoc(grandTotal, people) {
    var hasAny = BUDGET_CATS.some(function (cat) {
      return data.budget.cats[cat.key].some(function (it) {
        return it.detail.trim() || toNumber(it.amount);
      });
    });
    if (!hasAny) return docSection("04", "예산", null, true);

    var table = document.createElement("table");
    table.className = "bt";
    var tbody = document.createElement("tbody");

    BUDGET_CATS.forEach(function (cat) {
      var rows = data.budget.cats[cat.key].filter(function (it) {
        return it.detail.trim() || toNumber(it.amount);
      });
      if (rows.length === 0) return;
      var sub = rows.reduce(function (s, it) { return s + toNumber(it.amount); }, 0);

      var ctr = document.createElement("tr");
      ctr.className = "bt-cat";
      var cth = document.createElement("th");
      cth.textContent = cat.title;
      var cst = document.createElement("th");
      cst.className = "bt-amt";
      cst.textContent = formatWon(sub);
      ctr.appendChild(cth); ctr.appendChild(cst);
      tbody.appendChild(ctr);

      rows.forEach(function (it) {
        var tr = document.createElement("tr");
        var td1 = document.createElement("td");
        td1.textContent = it.detail.trim() || cat.detailLabel;
        var td2 = document.createElement("td");
        td2.className = "bt-amt";
        td2.textContent = formatWon(toNumber(it.amount));
        tr.appendChild(td1); tr.appendChild(td2);
        tbody.appendChild(tr);
      });
    });
    table.appendChild(tbody);

    var tfoot = document.createElement("tfoot");
    var totalTr = document.createElement("tr");
    totalTr.className = "bt-total";
    var tl = document.createElement("td"); tl.textContent = "총합";
    var tv = document.createElement("td"); tv.className = "bt-amt"; tv.textContent = formatWon(grandTotal);
    totalTr.appendChild(tl); totalTr.appendChild(tv);
    tfoot.appendChild(totalTr);
    if (people > 0) {
      var perTr = document.createElement("tr");
      perTr.className = "bt-per";
      var pl = document.createElement("td"); pl.textContent = "1인당 (" + people + "명)";
      var pv = document.createElement("td"); pv.className = "bt-amt";
      pv.textContent = formatWon(Math.round(grandTotal / people));
      perTr.appendChild(pl); perTr.appendChild(pv);
      tfoot.appendChild(perTr);
    }
    table.appendChild(tfoot);

    return docSection("04", "예산", table);
  }

  // 비어 있는 필수 항목 목록
  function getMissingItems() {
    var miss = [];
    if (!/^\d{5}$/.test(data.studentId.trim())) miss.push("학번(5자리)");
    if (!data.name.trim()) miss.push("이름");
    if (!data.destination.trim()) miss.push("여행지");
    if (!data.theme) miss.push("역사 테마 선택");

    var hasEvent = data.timeline.some(function (t) { return t.event.trim(); });
    if (!hasEvent) miss.push("역사 타임라인 (사건)");

    var allSched = data.schedule.day1.concat(data.schedule.day2);
    if (allSched.length === 0) {
      miss.push("일정표 방문지");
    } else {
      [["day1", "1일차"], ["day2", "2일차"]].forEach(function (pair) {
        data.schedule[pair[0]].forEach(function (c, i) {
          if (!c.meaning.trim()) {
            var name = c.place.trim() || (i + 1) + "번 장소";
            miss.push(pair[1] + " '" + name + "'의 역사적 의미");
          }
        });
      });
    }

    if (!data.food.some(function (f) { return f.name.trim(); })) miss.push("맛집");

    return miss;
  }

  function renderChecklist() {
    var box = document.getElementById("checkList");
    if (!box) return;
    box.innerHTML = "";
    var miss = getMissingItems();

    if (miss.length === 0) {
      box.className = "check-box no-print check-ok";
      var ok = document.createElement("p");
      ok.className = "check-title";
      ok.textContent = "✅ 모든 항목을 채웠어요! 제출 준비 완료.";
      box.appendChild(ok);
      return;
    }

    box.className = "check-box no-print check-warn";
    var head = document.createElement("p");
    head.className = "check-title";
    head.textContent = "⚠ 아직 비어 있는 항목이 " + miss.length + "개 있어요";
    box.appendChild(head);
    var ul = document.createElement("ul");
    ul.className = "check-list";
    miss.forEach(function (m) {
      var li = document.createElement("li");
      li.textContent = m + "이(가) 비어 있어요";
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // 완성본을 텍스트로 (복사·붙여넣기용)
  function buildSummaryText() {
    var L = [];
    L.push("=== " + (data.destination || "○○") + " 역사 여행 계획서 ===");
    L.push("학번 " + (data.studentId || "-") + " / 이름 " + (data.name || "-") +
      " / 테마: " + (data.theme || "-"));
    if (data.destinationReason.trim()) L.push("여행 이유: " + data.destinationReason.trim());
    L.push("");

    L.push("[역사 타임라인]");
    var tl = data.timeline.filter(function (t) { return t.year.trim() || t.event.trim(); });
    if (tl.length === 0) L.push("- (없음)");
    else tl.forEach(function (t) { L.push("- " + (t.year.trim() || "?") + "년: " + (t.event.trim() || "-")); });
    L.push("");

    L.push("[일정표]");
    var any = false;
    [["day1", "1일차"], ["day2", "2일차"]].forEach(function (pair) {
      var items = data.schedule[pair[0]];
      if (items.length === 0) return;
      any = true;
      L.push("<" + pair[1] + ">");
      items.forEach(function (c) {
        L.push("- " + (c.time.trim() ? c.time.trim() + " " : "") + (c.place.trim() || "장소 미정") +
          " — " + (c.meaning.trim() || "역사적 의미 미작성") + (c.photo ? " [사진 첨부됨]" : ""));
      });
    });
    if (!any) L.push("- (없음)");
    L.push("");

    L.push("[맛집]");
    var fd = data.food.filter(function (f) { return f.name.trim() || f.menu.trim() || f.review.trim() || f.photo; });
    if (fd.length === 0) L.push("- (없음)");
    else fd.forEach(function (f) {
      L.push("- " + (f.name.trim() || "-") +
        (f.menu.trim() ? " · " + f.menu.trim() : "") +
        (f.review.trim() ? " — " + f.review.trim() : "") +
        (f.photo ? " [사진 첨부됨]" : ""));
    });
    L.push("");

    L.push("[예산]");
    var grand = 0, hasBudget = false;
    BUDGET_CATS.forEach(function (cat) {
      var rows = data.budget.cats[cat.key].filter(function (it) {
        return it.detail.trim() || toNumber(it.amount);
      });
      if (rows.length === 0) return;
      hasBudget = true;
      var sub = rows.reduce(function (s, it) { return s + toNumber(it.amount); }, 0);
      grand += sub;
      L.push("<" + cat.title + " " + formatWon(sub) + ">");
      rows.forEach(function (it) {
        L.push("- " + (it.detail.trim() || cat.detailLabel) + ": " + formatWon(toNumber(it.amount)));
      });
    });
    if (!hasBudget) {
      L.push("- (없음)");
    } else {
      L.push("총합: " + formatWon(grand));
      var people = toNumber(data.budget.people);
      if (people > 0) L.push("1인당(" + people + "명): " + formatWon(Math.round(grand / people)));
    }

    return L.join("\n");
  }

  // PDF 저장: 브라우저 인쇄창의 기본 파일명은 document.title을 따름
  // → 인쇄 직전에 제목을 "학번_이름"으로 바꿨다가 끝나면 되돌림
  function printAsPdf() {
    var sid = (data.studentId || "").trim();
    var nm = (data.name || "").trim();
    var fname = (sid || "학번") + "_" + (nm || "이름");
    // 파일명에 못 쓰는 문자 제거
    fname = fname.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "");

    var prevTitle = document.title;
    document.title = fname;

    // 인쇄가 끝나면 원래 제목으로 복원
    var restore = function () {
      document.title = prevTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    setTimeout(restore, 1000); // afterprint 미지원 브라우저 대비

    window.print();
  }

  // 클립보드 복사 (최신 API → 실패 시 예전 방식으로 대체)
  function copySummary() {
    var text = buildSummaryText();
    var done = function () { showCopyFeedback("복사됐어요! 패들렛·클래스룸에 붙여넣으세요."); };
    var fail = function () { showCopyFeedback("복사가 안 됐어요. 화면 내용을 직접 선택해 복사해주세요.", true); };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {
          if (!legacyCopy(text)) fail();
        });
        return;
      }
    } catch (e) { /* 아래 대체 방식으로 */ }

    if (legacyCopy(text)) done();
    else fail();
  }

  // 예전 브라우저용 복사(임시 textarea + execCommand)
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function showCopyFeedback(msg, isError) {
    var el = document.getElementById("copyFeedback");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
  }

  // 선생님 이메일 주소 복사 (Gmail 받는 사람 칸에 붙여넣기용)
  function copyEmail() {
    var el = document.getElementById("teacherEmail");
    var email = (el && el.textContent.trim()) ? el.textContent.trim() : "";
    if (!email) return;
    var done = function () { showEmailFeedback("이메일 주소가 복사됐어요. Gmail 받는 사람 칸에 붙여넣으세요."); };
    var fail = function () { showEmailFeedback("복사가 안 됐어요. 주소를 길게 눌러 직접 복사해주세요.", true); };

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, function () {
          if (!legacyCopy(email)) fail();
        });
        return;
      }
    } catch (e) { /* 아래 대체 방식으로 */ }

    if (legacyCopy(email)) done();
    else fail();
  }

  function showEmailFeedback(msg, isError) {
    var el = document.getElementById("emailFeedback");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-error", !!isError);
  }

  function renderLists() {
    renderTimeline();
    renderSchedule();
    renderFood();
    renderBudget();
  }

  /* ========== 이벤트 연결 ========== */
  function bindEvents() {
    // 이전 / 다음
    prevBtn.addEventListener("click", function () {
      showScreen(current - 1);
    });
    nextBtn.addEventListener("click", function () {
      showScreen(current + 1);
    });

    // 완성본: PDF 저장 / 전체 복사
    var printBtn = document.getElementById("printBtn");
    var copyBtn = document.getElementById("copyBtn");
    if (printBtn) printBtn.addEventListener("click", printAsPdf);
    if (copyBtn) copyBtn.addEventListener("click", copySummary);
    var copyEmailBtn = document.getElementById("copyEmailBtn");
    if (copyEmailBtn) copyEmailBtn.addEventListener("click", copyEmail);

    // 텍스트 입력 자동저장 (입력할 때마다)
    document.addEventListener("input", function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;

      // 텍스트 상자는 입력할 때마다 내용 길이에 맞춰 높이 확장
      if (t.tagName === "TEXTAREA") autoGrow(t);

      // (1) 시작 섹션의 고정 입력칸
      if (t.getAttribute("data-save")) {
        var field = t.getAttribute("data-save");
        // 학번처럼 숫자 N자리만 허용하는 칸 처리
        var digits = t.getAttribute("data-digits");
        if (digits) {
          t.value = t.value.replace(/[^0-9]/g, "").slice(0, parseInt(digits, 10));
        }
        data[field] = t.value;
        saveData();
        return;
      }

      // (2) 동적으로 추가된 리스트 항목(타임라인·일정·맛집)
      if (t.getAttribute("data-list")) {
        handleListInput(t);
        return;
      }

      // (3) 예산 입력
      if (t.getAttribute("data-budget-field")) {
        handleBudgetInput(t);
      }
    });

    // 사진 파일 선택(change) — 맛집·방문지
    document.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute("data-photo") && t.type === "file") {
        handlePhotoInput(t);
      }
    });

    document.addEventListener("click", function (ev) {
      if (!ev.target.closest) return;

      // 예산 카테고리 항목 추가 / 삭제
      var budgetAdd = ev.target.closest("[data-add-cat]");
      if (budgetAdd) { addBudgetItem(budgetAdd.getAttribute("data-add-cat")); return; }
      var budgetDel = ev.target.closest("[data-del-cat]");
      if (budgetDel) {
        deleteBudgetItem(budgetDel.getAttribute("data-del-cat"), budgetDel.getAttribute("data-index"));
        return;
      }

      // 항목 추가 버튼
      var addBtn = ev.target.closest("[data-add]");
      if (addBtn) { handleAdd(addBtn.getAttribute("data-add")); return; }

      // 사진 삭제 버튼
      var photoDel = ev.target.closest(".photo-del");
      if (photoDel) { handlePhotoDelete(photoDel); return; }

      // 항목 삭제 버튼
      var delBtn = ev.target.closest(".del-btn");
      if (delBtn) { handleDelete(delBtn); return; }

      // 일정표 날짜 탭
      var tab = ev.target.closest(".tab-btn");
      if (tab) {
        activeDay = tab.getAttribute("data-day");
        renderSchedule();
        return;
      }

      // 선택 버튼(테마) — 한 그룹에서 하나만 선택
      var btn = ev.target.closest(".choice-btn");
      if (!btn) return;
      var container = btn.closest("[data-choice]");
      if (!container) return;

      var group = container.getAttribute("data-choice");
      var value = btn.getAttribute("data-value");

      // 이미 선택된 걸 다시 누르면 해제
      if (data[group] === value) {
        data[group] = "";
      } else {
        data[group] = value;
      }
      highlightChoice(group, data[group]);
      saveData();
    });
  }

  /* ========== 시작 ========== */
  function init() {
    loadData();
    restoreInputs();
    bindEvents();
    showScreen(typeof data.step === "number" ? data.step : 0);
  }

  init();
})();
