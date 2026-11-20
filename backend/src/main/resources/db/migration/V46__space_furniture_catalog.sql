-- A kind is a durable key in saved room JSON. Retire it with placeable = false
-- so its name, model dimensions and attachment surfaces remain available.
CREATE TABLE space_furniture_catalog (
    kind VARCHAR(64) PRIMARY KEY CHECK (length(kind) > 0),
    display_order INTEGER NOT NULL UNIQUE CHECK (display_order > 0),
    min_room_version INTEGER NOT NULL CHECK (min_room_version > 0),
    placeable BOOLEAN NOT NULL,
    definition JSONB NOT NULL,
    CHECK ((
        jsonb_typeof(definition) = 'object'
        AND NOT (definition ?| ARRAY['kind', 'minRoomVersion', 'placeable'])
        AND jsonb_typeof(definition->'name') = 'string'
        AND length(definition->>'name') > 0
        AND definition->>'category' IN ('furniture', 'memories')
        AND (NOT (definition ? 'collection') OR jsonb_typeof(definition->'collection') = 'string')
        AND (NOT (definition ? 'mount') OR definition->>'mount' IN ('wall', 'ceiling'))
        AND (NOT (definition ? 'underlay') OR jsonb_typeof(definition->'underlay') = 'boolean')
        AND (NOT (definition ? 'prop') OR jsonb_typeof(definition->'prop') = 'boolean')
        AND (NOT (definition ? 'connectedSurface') OR jsonb_typeof(definition->'connectedSurface') = 'boolean')
        AND (NOT (definition ? 'walkableHeight') OR
            (jsonb_typeof(definition->'walkableHeight') = 'number' AND (definition->'walkableHeight') > '0'::jsonb))
        AND jsonb_typeof(definition->'width') = 'number' AND (definition->'width') > '0'::jsonb
        AND jsonb_typeof(definition->'depth') = 'number' AND (definition->'depth') > '0'::jsonb
        AND jsonb_typeof(definition->'height') = 'number' AND (definition->'height') > '0'::jsonb
        AND jsonb_typeof(definition->'surfaces') = 'array'
        AND NOT jsonb_path_exists(definition->'surfaces', 'strict $[*] ? (@.type() != "number" || @ <= 0)')
    ) IS TRUE)
);

-- Preserve the pre-migration editor order, metadata and validation rules.
-- minRoomVersion describes the server write contract (20 v8 kinds, full set from v9).
INSERT INTO space_furniture_catalog (kind, display_order, min_room_version, placeable, definition)
SELECT item->>'kind', position, (item->>'minRoomVersion')::integer, (item->>'placeable')::boolean,
       item - 'kind' - 'minRoomVersion' - 'placeable'
FROM jsonb_array_elements($catalog$
[
  {"kind":"sofa","minRoomVersion":8,"placeable":true,"name":"구름 소파","width":2.8,"depth":1.1,"height":1.17,"category":"furniture","surfaces":[]},
  {"kind":"armchair","minRoomVersion":8,"placeable":true,"name":"햇살 의자","width":1.1,"depth":1.1,"height":1.21,"category":"furniture","surfaces":[]},
  {"kind":"table","minRoomVersion":8,"placeable":true,"name":"우리 테이블","width":2.4,"depth":1.5,"height":1.55,"category":"furniture","surfaces":[0.9]},
  {"kind":"bookshelf","minRoomVersion":8,"placeable":true,"name":"작은 책장","width":1.8,"depth":0.65,"height":2.17,"category":"furniture","surfaces":[0.55,1.15,1.75,2.05]},
  {"kind":"plant","minRoomVersion":8,"placeable":true,"name":"초록 친구","width":0.7,"depth":0.7,"height":1.22,"category":"furniture","surfaces":[]},
  {"kind":"rug","underlay":true,"minRoomVersion":8,"placeable":true,"name":"포근한 러그","width":2.8,"depth":2,"height":0.06,"category":"furniture","surfaces":[]},
  {"kind":"stool","minRoomVersion":8,"placeable":true,"name":"동그란 스툴","width":0.65,"depth":0.65,"height":0.7,"category":"furniture","surfaces":[]},
  {"kind":"bench","minRoomVersion":8,"placeable":true,"name":"함께 앉는 벤치","width":2,"depth":0.8,"height":1.26,"category":"furniture","surfaces":[]},
  {"kind":"beanbag","minRoomVersion":8,"placeable":true,"name":"폭신한 빈백","width":1.2,"depth":1.2,"height":1.04,"category":"furniture","surfaces":[]},
  {"kind":"diningTable","minRoomVersion":8,"placeable":true,"name":"여럿이 먹는 식탁","width":3.4,"depth":1.7,"height":1.21,"category":"furniture","surfaces":[0.88]},
  {"kind":"gameTable","minRoomVersion":8,"placeable":true,"name":"함께 노는 게임 테이블","width":4.4,"depth":2.7,"height":0.98,"category":"furniture","surfaces":[0.79]},
  {"kind":"roundChair","minRoomVersion":8,"placeable":true,"name":"포근한 라운드 체어","width":1.4,"depth":1.4,"height":1.1,"category":"furniture","surfaces":[]},
  {"kind":"clubSofa","minRoomVersion":8,"placeable":true,"name":"클럽 라운지 소파","width":3.6,"depth":1.2,"height":1.18,"category":"furniture","surfaces":[]},
  {"kind":"gameCredenza","minRoomVersion":8,"placeable":true,"name":"게임 수납 콘솔","width":3.6,"depth":0.65,"height":1.35,"category":"furniture","surfaces":[1.1]},
  {"kind":"loungeRug","underlay":true,"minRoomVersion":8,"placeable":true,"name":"넓은 라운지 러그","width":8.6,"depth":7.4,"height":0.04,"category":"furniture","surfaces":[]},
  {"kind":"gameShelf","minRoomVersion":8,"placeable":true,"name":"보드게임 서가","width":2.4,"depth":0.55,"height":2.71,"category":"furniture","surfaces":[]},
  {"kind":"gameChair","minRoomVersion":8,"placeable":true,"name":"게임 의자","width":0.75,"depth":0.8,"height":1.05,"category":"furniture","surfaces":[]},
  {"kind":"floorLamp","minRoomVersion":8,"placeable":true,"name":"따뜻한 장스탠드","width":0.6,"depth":0.6,"height":1.88,"category":"furniture","surfaces":[]},
  {"kind":"musicConsole","minRoomVersion":8,"placeable":true,"name":"우리 모임 턴테이블","width":1.44,"depth":0.8,"height":1.01,"category":"furniture","collection":"essentials","surfaces":[]},
  {"kind":"activityBoard","minRoomVersion":9,"placeable":true,"name":"활동 사진 보드","width":2.4,"depth":0.7,"height":2.5,"category":"furniture","collection":"essentials","surfaces":[]},
  {"kind":"clubDashboard","minRoomVersion":9,"placeable":true,"name":"모임 대시보드","width":1.8,"depth":0.7,"height":2.3,"category":"furniture","collection":"essentials","surfaces":[]},
  {"kind":"coffeeTable","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"common","name":"낮은 원목 커피 테이블","width":2.4,"depth":1.3,"height":0.76,"surfaces":[0.5]},
  {"kind":"cafeTable","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"common","name":"테라스 원형 테이블","width":1.3,"depth":1.3,"height":1,"surfaces":[0.775]},
  {"kind":"leafyPlant","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"common","name":"풍성한 실내 나무","width":1.3,"depth":1.3,"height":2.25,"surfaces":[]},
  {"kind":"vinePlanter","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"common","name":"늘어지는 벽 화분","width":1.5,"depth":0.8,"height":3.3,"mount":"wall","surfaces":[]},
  {"kind":"galleryWall","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"photo","name":"높은 벽 사진 전시","width":4.4,"depth":0.24,"height":6.8,"mount":"wall","surfaces":[]},
  {"kind":"posterWall","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"band","name":"연습실 포스터 벽","width":4.4,"depth":0.24,"height":3.9,"mount":"wall","surfaces":[]},
  {"kind":"bandNeon","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"band","name":"Play 네온","width":3.8,"depth":0.35,"height":3.9,"mount":"wall","surfaces":[]},
  {"kind":"diningNeon","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"dining","name":"Good Food 사인","width":3.8,"depth":0.35,"height":3.9,"mount":"wall","surfaces":[]},
  {"kind":"studyNeon","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"study","name":"Better Together 사인","width":3.8,"depth":0.35,"height":3.9,"mount":"wall","surfaces":[]},
  {"kind":"photoNeon","minRoomVersion":9,"placeable":true,"category":"furniture","collection":"photo","name":"Capture Together 사인","width":3.8,"depth":0.35,"height":7.2,"mount":"wall","surfaces":[]},
  {"kind":"longCredenza","minRoomVersion":9,"placeable":true,"name":"긴 수납 카운터","width":4.8,"depth":1,"height":1.02,"collection":"common","category":"furniture","surfaces":[0.98]},
  {"kind":"worktop","minRoomVersion":9,"placeable":true,"name":"긴 작업대","width":4.8,"depth":1.1,"height":0.96,"collection":"common","category":"furniture","surfaces":[0.92]},
  {"kind":"openDisplayShelf","minRoomVersion":9,"placeable":true,"name":"빈 오픈 선반","width":2.4,"depth":0.7,"height":3.12,"collection":"common","category":"furniture","surfaces":[0.25,0.95,1.65,2.35,3.05]},
  {"kind":"wallShelf","minRoomVersion":9,"placeable":true,"name":"벽 선반","width":2.4,"depth":0.65,"height":0.1,"collection":"common","category":"furniture","mount":"wall","surfaces":[0.08]},
  {"kind":"propBooks","minRoomVersion":9,"placeable":true,"name":"책과 잡지","width":0.55,"depth":0.4,"height":0.28,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propBookRow","minRoomVersion":9,"placeable":true,"name":"세워 꽂은 책 묶음","width":0.56,"depth":0.35,"height":0.6,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propBottle","minRoomVersion":9,"placeable":true,"name":"유리병과 물병","width":0.22,"depth":0.22,"height":0.45,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propCup","minRoomVersion":9,"placeable":true,"name":"개인 머그","width":0.34,"depth":0.22,"height":0.22,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propPlant","minRoomVersion":9,"placeable":true,"name":"작은 화분","width":0.55,"depth":0.55,"height":0.75,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propPlates","minRoomVersion":9,"placeable":true,"name":"접시와 음식","width":0.6,"depth":0.6,"height":0.21,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propGameBox","minRoomVersion":9,"placeable":true,"name":"보드게임 상자","width":0.65,"depth":0.48,"height":0.58,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propCamera","minRoomVersion":9,"placeable":true,"name":"카메라와 렌즈","width":0.55,"depth":0.54,"height":0.32,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propLaptop","minRoomVersion":9,"placeable":true,"name":"노트북","width":0.65,"depth":0.48,"height":0.44,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propFrame","minRoomVersion":9,"placeable":true,"name":"탁상 액자","width":0.38,"depth":0.18,"height":0.44,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propLamp","minRoomVersion":9,"placeable":true,"name":"탁상 스탠드","width":0.45,"depth":0.45,"height":0.62,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propGameBoard","minRoomVersion":9,"placeable":true,"name":"게임판과 말","width":1.5,"depth":1.1,"height":0.12,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propMonitor","minRoomVersion":9,"placeable":true,"name":"모니터와 키보드","width":0.9,"depth":0.65,"height":0.75,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propCanisters","minRoomVersion":9,"placeable":true,"name":"식재료 보관병","width":0.65,"depth":0.4,"height":0.42,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"propPedals","minRoomVersion":9,"placeable":true,"name":"이펙터와 케이블","width":0.9,"depth":0.6,"height":0.16,"collection":"props","category":"furniture","prop":true,"surfaces":[]},
  {"kind":"hangingLamp","minRoomVersion":9,"placeable":true,"name":"높이 조절 펜던트","width":0.75,"depth":0.75,"height":1.5,"collection":"architecture","category":"furniture","mount":"ceiling","surfaces":[]},
  {"kind":"trackLight","minRoomVersion":9,"placeable":true,"name":"이동식 4구 조명 레일","width":4,"depth":0.45,"height":0.38,"collection":"architecture","category":"furniture","mount":"ceiling","surfaces":[]},
  {"kind":"ceilingBeam","minRoomVersion":9,"placeable":true,"name":"노출 천장 보","width":6,"depth":0.2,"height":0.34,"collection":"architecture","category":"furniture","mount":"ceiling","surfaces":[]},
  {"kind":"acousticCloud","minRoomVersion":9,"placeable":true,"name":"천장 흡음 패널","width":2.6,"depth":1.15,"height":0.52,"collection":"architecture","category":"furniture","mount":"ceiling","surfaces":[]},
  {"kind":"wallPrint","minRoomVersion":9,"placeable":true,"name":"갤러리 포스터","width":1.15,"depth":0.12,"height":1.45,"collection":"architecture","category":"furniture","mount":"wall","surfaces":[]},
  {"kind":"pictureLight","minRoomVersion":9,"placeable":true,"name":"액자 벽등","width":0.9,"depth":0.6,"height":0.3,"collection":"architecture","category":"furniture","mount":"wall","surfaces":[]},
  {"kind":"acousticTile","minRoomVersion":9,"placeable":true,"name":"벽 흡음 패널","width":1.6,"depth":0.2,"height":2.2,"collection":"architecture","category":"furniture","mount":"wall","surfaces":[]},
  {"kind":"loftPartition","minRoomVersion":9,"placeable":true,"name":"복층 방 벽 모듈","width":4,"depth":0.22,"height":4.4,"collection":"architecture","category":"furniture","surfaces":[]},
  {"kind":"loftGlassPartition","minRoomVersion":9,"placeable":true,"name":"복층 방 유리벽 모듈","width":4,"depth":0.22,"height":4.4,"collection":"architecture","category":"furniture","surfaces":[]},
  {"kind":"lowEdgeLight","minRoomVersion":9,"placeable":true,"name":"하부 간접조명","width":2.4,"depth":0.08,"height":0.08,"category":"furniture","collection":"architecture","mount":"wall","surfaces":[]},
  {"kind":"libraryShelfWood","minRoomVersion":9,"placeable":true,"category":"furniture","name":"원목 게임 라이브러리","width":2.4,"depth":0.7,"height":3.34,"collection":"boardgame","surfaces":[3.25]},
  {"kind":"libraryShelfDisplay","minRoomVersion":9,"placeable":true,"category":"furniture","name":"게임 전시 라이브러리","width":2.4,"depth":0.7,"height":3.34,"collection":"boardgame","surfaces":[3.25]},
  {"kind":"libraryShelfDark","minRoomVersion":9,"placeable":true,"category":"furniture","name":"다크 게임 라이브러리","width":2.4,"depth":0.7,"height":3.34,"collection":"boardgame","surfaces":[3.25]},
  {"kind":"gameWallBoard","minRoomVersion":9,"placeable":true,"category":"furniture","name":"게임방 추억 게시판","width":4.8,"depth":0.18,"height":3.45,"mount":"wall","collection":"boardgame","surfaces":[]},
  {"kind":"gameWallArt","minRoomVersion":9,"placeable":true,"category":"furniture","name":"게임 아트와 벽 조명","width":2.7,"depth":0.5,"height":3.4,"mount":"wall","collection":"boardgame","surfaces":[]},
  {"kind":"gameNeon","minRoomVersion":9,"placeable":true,"category":"furniture","name":"Good Game 네온","width":3.1,"depth":0.7,"height":7.8,"mount":"wall","collection":"boardgame","surfaces":[]},
  {"kind":"pendantLight","minRoomVersion":9,"placeable":true,"category":"furniture","name":"높은 홀 펜던트","width":0.8,"depth":0.8,"height":7.8,"mount":"ceiling","collection":"common","surfaces":[]},
  {"kind":"pendantBulb","minRoomVersion":9,"placeable":true,"category":"furniture","name":"높은 홀 전구","width":0.3,"depth":0.3,"height":7.8,"mount":"ceiling","collection":"common","surfaces":[]},
  {"kind":"loftPendant","minRoomVersion":9,"placeable":true,"category":"furniture","name":"다락 펜던트","width":0.8,"depth":0.8,"height":4.2,"mount":"ceiling","collection":"common","surfaces":[]},
  {"kind":"shelfPendant","minRoomVersion":9,"placeable":true,"category":"furniture","name":"서가 펜던트","width":0.3,"depth":0.3,"height":3.34,"mount":"ceiling","collection":"common","surfaces":[]},
  {"kind":"climbingWallWide","minRoomVersion":9,"placeable":true,"category":"furniture","name":"높은 클라이밍 월","width":3.34,"depth":2.06,"height":11.31,"connectedSurface":true,"collection":"climbing","surfaces":[]},
  {"kind":"climbingWallOverhang","minRoomVersion":9,"placeable":true,"category":"furniture","name":"오버행 클라이밍 월","width":3.34,"depth":2.5,"height":11.31,"connectedSurface":true,"collection":"climbing","surfaces":[]},
  {"kind":"climbingWallNarrow","minRoomVersion":9,"placeable":true,"category":"furniture","name":"코너 클라이밍 월","width":3,"depth":2.08,"height":11.31,"connectedSurface":true,"collection":"climbing","surfaces":[]},
  {"kind":"crashMat","minRoomVersion":9,"placeable":true,"category":"furniture","name":"35cm 클라이밍 매트","width":4.15,"depth":2.3,"height":0.35,"walkableHeight":0.35,"collection":"climbing","surfaces":[]},
  {"kind":"crashMatWide","minRoomVersion":9,"placeable":true,"category":"furniture","name":"35cm 와이드 매트","width":4.75,"depth":1.8,"height":0.35,"walkableHeight":0.35,"collection":"climbing","surfaces":[]},
  {"kind":"climbingShoeShelf","minRoomVersion":9,"placeable":true,"category":"furniture","name":"암벽화 보관장","width":1.66,"depth":0.95,"height":3.53,"collection":"climbing","surfaces":[]},
  {"kind":"climbingHelmetShelf","minRoomVersion":9,"placeable":true,"category":"furniture","name":"헬멧 보관장","width":1.66,"depth":0.95,"height":2.5,"collection":"climbing","surfaces":[]},
  {"kind":"climbingGearShelf","minRoomVersion":9,"placeable":true,"category":"furniture","name":"초크백과 장비 보관장","width":1.66,"depth":0.95,"height":3.53,"collection":"climbing","surfaces":[]},
  {"kind":"ropeRack","minRoomVersion":9,"placeable":true,"category":"furniture","name":"클라이밍 로프 걸이","width":1.65,"depth":0.35,"height":3.5,"mount":"wall","collection":"climbing","surfaces":[]},
  {"kind":"climbingPlant","minRoomVersion":9,"placeable":true,"category":"furniture","name":"암장의 잎사귀 화분","width":0.7,"depth":0.7,"height":1.1,"collection":"common","surfaces":[]},
  {"kind":"climbingSign","minRoomVersion":9,"placeable":true,"category":"furniture","name":"Higher Together 사인","width":2.65,"depth":0.22,"height":3.88,"mount":"wall","collection":"climbing","surfaces":[]},
  {"kind":"climbingBoard","minRoomVersion":9,"placeable":true,"category":"furniture","name":"클라이밍 기록 보드","width":4.8,"depth":0.18,"height":3.58,"mount":"wall","collection":"climbing","surfaces":[]},
  {"kind":"clubPinboard","minRoomVersion":9,"placeable":true,"category":"furniture","name":"덩굴 추억 게시판","width":5.6,"depth":0.8,"height":3.8,"mount":"wall","collection":"common","surfaces":[]},
  {"kind":"cafeCounter","minRoomVersion":9,"placeable":true,"category":"furniture","name":"아지트 카페 카운터","width":3.8,"depth":1.2,"height":3.1,"collection":"common","surfaces":[]},
  {"kind":"cafeFridge","minRoomVersion":9,"placeable":true,"category":"furniture","name":"아지트 냉장고","width":0.92,"depth":1,"height":1.95,"collection":"common","surfaces":[]},
  {"kind":"kitchenCounter","minRoomVersion":9,"placeable":true,"name":"싱크대와 조리 수납장","width":3.2,"depth":0.9,"height":2.8,"collection":"dining","category":"furniture","surfaces":[1.015,1.915,2.415]},
  {"kind":"kitchenIsland","minRoomVersion":9,"placeable":true,"name":"오픈 키친 아일랜드","width":3.8,"depth":1.5,"height":1.5,"collection":"dining","category":"furniture","surfaces":[1.015]},
  {"kind":"kitchenRange","minRoomVersion":9,"placeable":true,"name":"레인지와 후드","width":1.8,"depth":0.9,"height":2.65,"collection":"dining","category":"furniture","surfaces":[]},
  {"kind":"kitchenFridge","minRoomVersion":9,"placeable":true,"name":"메모가 붙은 냉장고","width":1.2,"depth":1,"height":2.2,"collection":"dining","category":"furniture","surfaces":[]},
  {"kind":"pantryShelf","minRoomVersion":9,"placeable":true,"name":"식재료 팬트리","width":2.4,"depth":0.65,"height":2.8,"collection":"dining","category":"furniture","surfaces":[0.65,1.3,1.95,2.65]},
  {"kind":"cafeCabinet","minRoomVersion":9,"placeable":true,"name":"커피와 간식 코너","width":2.4,"depth":0.8,"height":1.9,"collection":"dining","category":"furniture","surfaces":[1.015]},
  {"kind":"feastTable","minRoomVersion":9,"placeable":true,"name":"함께 먹는 긴 식탁","width":4.8,"depth":1.8,"height":1.5,"collection":"dining","category":"furniture","surfaces":[0.98]},
  {"kind":"menuBoard","minRoomVersion":9,"placeable":true,"name":"오늘의 메뉴 칠판","width":1.25,"depth":0.6,"height":1.9,"collection":"dining","category":"furniture","surfaces":[]},
  {"kind":"foodMap","minRoomVersion":9,"placeable":true,"name":"우리 맛집 지도 보드","width":2.6,"depth":0.5,"height":2.6,"collection":"dining","category":"furniture","surfaces":[]},
  {"kind":"drumKit","minRoomVersion":9,"placeable":true,"name":"어쿠스틱 드럼 세트","width":2.8,"depth":2.5,"height":1.9,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"guitarRack","minRoomVersion":9,"placeable":true,"name":"기타 세 대와 거치대","width":2,"depth":0.65,"height":1.7,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"rehearsalKeyboard","minRoomVersion":9,"placeable":true,"name":"88건반과 연주대","width":1.8,"depth":0.8,"height":1.1,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"amplifier","minRoomVersion":9,"placeable":true,"name":"기타 앰프 스택","width":1.2,"depth":0.65,"height":1.65,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"microphoneStand","minRoomVersion":9,"placeable":true,"name":"보컬 마이크 스탠드","width":0.65,"depth":0.65,"height":1.8,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"mixingDesk","minRoomVersion":9,"placeable":true,"name":"레코딩 믹싱 데스크","width":2.4,"depth":1,"height":1.65,"collection":"band","category":"furniture","surfaces":[0.925]},
  {"kind":"acousticPanel","minRoomVersion":9,"placeable":true,"name":"이동식 흡음 패널","width":1.6,"depth":0.35,"height":2.7,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"bandPoster","minRoomVersion":9,"placeable":true,"name":"공연 포스터 전시대","width":1.6,"depth":0.4,"height":2.6,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"rehearsalStage","minRoomVersion":9,"placeable":true,"name":"낮은 연습 무대","width":6,"depth":4,"height":0.25,"walkableHeight":0.25,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"stageLight","minRoomVersion":9,"placeable":true,"name":"보라빛 무대 조명","width":0.7,"depth":0.7,"height":2.9,"collection":"band","category":"furniture","surfaces":[]},
  {"kind":"studyDesk","minRoomVersion":9,"placeable":true,"name":"네 사람이 함께 쓰는 개발 데스크","width":4.4,"depth":2,"height":1.63,"collection":"study","category":"furniture","surfaces":[0.79]},
  {"kind":"focusDesk","minRoomVersion":9,"placeable":true,"name":"개인 집중 데스크","width":2.2,"depth":1.1,"height":1.65,"collection":"study","category":"furniture","surfaces":[0.79]},
  {"kind":"whiteboard","minRoomVersion":9,"placeable":true,"name":"바퀴 달린 스프린트 보드","width":2.6,"depth":0.7,"height":2.35,"collection":"study","category":"furniture","surfaces":[]},
  {"kind":"projectScreen","minRoomVersion":9,"placeable":true,"name":"발표용 프로젝션 스크린","width":3.6,"depth":0.7,"height":2.8,"collection":"study","category":"furniture","surfaces":[]},
  {"kind":"serverRack","minRoomVersion":9,"placeable":true,"name":"프로젝트 서버 랙","width":1,"depth":1,"height":2.25,"collection":"study","category":"furniture","surfaces":[]},
  {"kind":"projectShelf","minRoomVersion":9,"placeable":true,"name":"개발 서적과 프로젝트 선반","width":2.6,"depth":0.6,"height":2.65,"collection":"study","category":"furniture","surfaces":[]},
  {"kind":"studyCabinet","minRoomVersion":9,"placeable":true,"name":"공용 문구 수납장","width":2.4,"depth":0.65,"height":1.18,"collection":"study","category":"furniture","surfaces":[0.95]},
  {"kind":"projectDisplay","minRoomVersion":9,"placeable":true,"name":"프로젝트 전시 스크린","width":3,"depth":0.7,"height":2.4,"collection":"study","category":"furniture","surfaces":[]},
  {"kind":"photoBackdrop","minRoomVersion":9,"placeable":true,"name":"곡면 배경지 촬영 부스","width":4.8,"depth":2.8,"height":3.24,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"softbox","minRoomVersion":9,"placeable":true,"name":"팔각 소프트박스","width":1.4,"depth":1.4,"height":2.7,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"photoTripod","minRoomVersion":9,"placeable":true,"name":"카메라와 삼각대","width":1,"depth":1,"height":1.7,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"cameraCabinet","minRoomVersion":9,"placeable":true,"name":"카메라·렌즈 전시 수납장","width":2.8,"depth":0.65,"height":2.7,"collection":"photo","category":"furniture","surfaces":[2.7]},
  {"kind":"photoEditDesk","minRoomVersion":9,"placeable":true,"name":"사진 보정 워크스테이션","width":2.8,"depth":1.1,"height":1.7,"collection":"photo","category":"furniture","surfaces":[0.79]},
  {"kind":"photoPrintBench","minRoomVersion":9,"placeable":true,"name":"인화·포트폴리오 작업대","width":3,"depth":1.1,"height":1.4,"collection":"photo","category":"furniture","surfaces":[0.92]},
  {"kind":"galleryPartition","minRoomVersion":9,"placeable":true,"name":"이동식 사진 갤러리 벽","width":3.2,"depth":0.5,"height":2.9,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"photoEquipmentCase","minRoomVersion":9,"placeable":true,"name":"촬영 장비 하드 케이스","width":1.2,"depth":0.8,"height":0.8,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"photoReflector","minRoomVersion":9,"placeable":true,"name":"스탠드 반사판","width":1.2,"depth":0.7,"height":2.05,"collection":"photo","category":"furniture","surfaces":[]},
  {"kind":"memory","minRoomVersion":8,"placeable":true,"name":"추억 액자","width":1,"depth":0.6,"height":1.4,"category":"memories","surfaces":[]}
]
$catalog$::jsonb) WITH ORDINALITY AS catalog(item, position);

-- Saved rooms reference kinds inside JSON and cannot use a foreign key. Keep every
-- published reference renderable and editable. New geometry needs a new kind.
CREATE FUNCTION keep_published_furniture_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Saved rooms reference published furniture; retire with placeable = false or publish a new kind';
END
$$;

CREATE TRIGGER retain_published_furniture BEFORE DELETE OR TRUNCATE ON space_furniture_catalog
FOR EACH STATEMENT EXECUTE FUNCTION keep_published_furniture_kind();

CREATE TRIGGER retain_furniture_compatibility BEFORE UPDATE ON space_furniture_catalog
FOR EACH ROW WHEN (
    NEW.kind <> OLD.kind OR NEW.min_room_version > OLD.min_room_version
    OR (NEW.definition - ARRAY['name', 'category', 'collection']) <>
       (OLD.definition - ARRAY['name', 'category', 'collection'])
) EXECUTE FUNCTION keep_published_furniture_kind();
