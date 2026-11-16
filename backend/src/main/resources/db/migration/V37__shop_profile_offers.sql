CREATE TABLE shop_profile_equipment (
    member_id bigint PRIMARY KEY,
    item_id varchar(64) NOT NULL,
    FOREIGN KEY (member_id, item_id) REFERENCES shop_purchase(member_id, item_id)
);

INSERT INTO shop_product (id, definition, available) VALUES
    ('sleepy-bear-frame', '{
        "name": "꾸벅 곰돌이 프레임",
        "description": "동그란 귀에 졸린 눈. 곰돌이가 프로필을 꼭 안아줘요.",
        "categoryId": "profile", "price": 600,
        "preview": {"type": "profile", "art": "bearFrame", "tone": "cocoa"},
        "grant": {"itemId": "sleepy-bear-frame", "slot": "frame"}
    }', true),
    ('frame', '{
        "name": "반짝이는 내 자리",
        "description": "프로필 테두리에 별을 더하는 장식 프레임.",
        "categoryId": "profile", "price": 1800,
        "preview": {"type": "profile", "art": "frame", "tone": "lilac"},
        "grant": {"itemId": "frame", "slot": "frame"}
    }', true);
