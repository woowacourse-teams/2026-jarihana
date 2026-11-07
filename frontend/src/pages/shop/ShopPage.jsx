import { useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  Check,
  Coins,
  Grid2X2,
  Package,
  Shirt,
  Sparkles,
  UserRound
} from "lucide-react";
import {
  formatPoints,
  purchaseBlockReason,
  SHOP_ERROR_MESSAGES
} from "../../entities/shop/index.js";
import { createDemoShopClient } from "../../features/shop/demoClient.js";
import { useShop } from "../../features/shop/hooks.js";
import { useAuth } from "../../features/auth/index.js";
import { AvatarFrame } from "../../features/avatar/AvatarFrame.jsx";
import { AVATAR_BASIC_APPEARANCE } from "../../../public/sparring-arena/src/avatar-appearance.js";
import { Button, Modal } from "../../shared/ui/index.js";
import { ProductArt } from "./ProductArt.jsx";
import "../account/avatar.css";
import "./shop.css";

const CATEGORY_ICONS = { all: Grid2X2, wear: Shirt, profile: UserRound };
const BASE_APPEARANCE = { ...AVATAR_BASIC_APPEARANCE, hair: "bob", outfit: "mint" };
const buttonLabels = {
  ALREADY_OWNED: "보유 중",
  PRODUCT_UNAVAILABLE: "판매 종료",
  INSUFFICIENT_POINTS: "포인트 부족"
};

function ProductCard({ product, selected, owned, equipped, onSelect }) {
  return (
    <button
      type="button"
      className={`shop-product${selected ? " shop-product--selected" : ""}`}
      aria-label={`${product.name} 상세 보기`}
      aria-pressed={selected}
      data-ph-capture-attribute-action="shop_product_select"
      onClick={onSelect}
    >
      <span className={`shop-product__image shop-tone--${product.preview.tone}`}>
        <span className="shop-product__badge">
          {equipped
            ? "착용 중"
            : owned
              ? "보유 중"
              : product.status === "ENDED"
                ? "판매 종료"
                : product.badge}
        </span>
        <ProductArt {...product.preview} />
        {selected && (
          <span className="shop-product__check">
            <Check size={14} />
          </span>
        )}
      </span>
      <span className="shop-product__name">{product.name}</span>
      {!owned && (
        <span className="shop-product__price">
          <Coins size={15} /> {formatPoints(product.price)}
        </span>
      )}
    </button>
  );
}

function ProductDetail({ product, wallet, inventory, catalog, onBuy, onEquip, pending }) {
  const reason = purchaseBlockReason(product, wallet, inventory);
  const owned = reason === "ALREADY_OWNED";
  const equipped = inventory.equipped[product.grant.slot] === product.grant.itemId;
  const appearance = { ...BASE_APPEARANCE };
  for (const itemId of Object.values(inventory.equipped)) {
    Object.assign(
      appearance,
      inventory.items.find((item) => item.itemId === itemId)?.preview.appearance
    );
  }
  Object.assign(appearance, product.preview.appearance);
  return (
    <section className="shop-detail" aria-label="선택한 상품">
      <div className="shop-detail__heading">
        <span>
          <Sparkles size={16} /> 미리보기
        </span>
        <span>{product.preview.type === "avatar" ? "예시 캐릭터" : "예시 아이템"}</span>
      </div>
      <div className={`shop-detail__stage shop-tone--${product.preview.tone}`}>
        {product.preview.type === "avatar" ? (
          <AvatarFrame appearance={appearance} mode="preview" />
        ) : (
          <ProductArt {...product.preview} />
        )}
        <span className="shop-detail__stage-label">
          {product.preview.type === "avatar"
            ? "선택 상품을 미리 착용한 모습"
            : "프로필 아이템 미리보기"}
        </span>
      </div>
      <div className="shop-detail__body">
        <p className="shop-detail__category">
          {catalog.categories.find((category) => category.id === product.categoryId)?.label} · 영구
          보유
        </p>
        <h2>{product.name}</h2>
        <p className="shop-detail__description">{product.description}</p>
        <div className="shop-detail__price">
          <span>{owned ? "보유 상태" : "가격"}</span>
          <strong>
            {owned ? (
              <>
                <Check size={20} /> 영구 보유
              </>
            ) : (
              <>
                <Coins size={20} /> {formatPoints(product.price)}
              </>
            )}
          </strong>
        </div>
        {owned ? (
          <Button
            block
            data-ph-capture-attribute-action="shop_equipment_toggle"
            pending={pending}
            onClick={() => onEquip(product, !equipped)}
          >
            {equipped ? "착용 해제" : "체험 캐릭터에 착용"}
          </Button>
        ) : (
          <Button
            block
            data-ph-capture-attribute-action="shop_purchase_open"
            disabled={Boolean(reason)}
            onClick={() => onBuy(product)}
          >
            {buttonLabels[reason] || "구매하기"}
          </Button>
        )}
        <p className="shop-detail__note">
          {reason === "INSUFFICIENT_POINTS"
            ? `${formatPoints(product.price - wallet.balance)} 더 필요해요.`
            : owned
              ? "보유 아이템은 언제든 다시 착용할 수 있어요."
              : "한 번 구매하면 계속 사용할 수 있어요."}
        </p>
      </div>
    </section>
  );
}

export function ShopPreview({ client }) {
  const { query, purchase, equipment } = useShop(client);
  const [category, setCategory] = useState("all");
  const [selection, setSelection] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [message, setMessage] = useState("");
  const mutationLock = useRef(false);
  const detailsRef = useRef(null);
  const { data } = query;

  function openPurchase(product) {
    purchase.reset();
    setConfirmation({
      productId: product.id,
      termsVersion: product.termsVersion,
      requestId: crypto.randomUUID()
    });
  }

  async function confirmPurchase() {
    if (!confirmation || mutationLock.current) return;
    mutationLock.current = true;
    try {
      const result = await purchase.mutateAsync(confirmation);
      setConfirmation(null);
      setMessage(
        `${data.catalog.products.find((item) => item.id === result.productId)?.name} 구매를 마쳤어요.`
      );
    } catch (error) {
      // Unknown outcomes retain the same requestId for safe retry.
      if (SHOP_ERROR_MESSAGES[error.code]) void query.refetch();
    } finally {
      mutationLock.current = false;
    }
  }

  async function equip(product, equipped) {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setMessage("");
    try {
      await equipment.mutateAsync({ itemId: product.grant.itemId, equipped });
      setMessage(`${product.name} ${equipped ? "착용을 체험하고 있어요." : "착용을 해제했어요."}`);
    } catch {
      /* The mutation error is rendered below. */
    } finally {
      mutationLock.current = false;
    }
  }

  if (query.isPending)
    return (
      <div className="shop-page shop-loading" role="status">
        상점 문을 열고 있어요…
      </div>
    );
  if (query.isError)
    return (
      <div className="shop-page shop-loading">
        <p role="alert">상점을 불러오지 못했어요.</p>
        <Button data-ph-capture-attribute-action="shop_load_retry" onClick={() => query.refetch()}>
          다시 불러오기
        </Button>
      </div>
    );

  const { catalog, wallet, inventory } = data;
  const products = catalog.products.filter(
    (product) => category === "all" || product.categoryId === category
  );
  const selected = products.find((product) => product.id === selection) || products[0];
  const purchaseProduct =
    confirmation && catalog.products.find((product) => product.id === confirmation.productId);
  const pending = purchase.isPending || equipment.isPending;
  const definitiveError = Boolean(SHOP_ERROR_MESSAGES[purchase.error?.code]);
  const categories = [{ id: "all", label: "전체 상품" }, ...catalog.categories];

  return (
    <div className="shop-page">
      <div className="shop-demo-notice">
        <span>미리보기</span> 예시 상품과 체험 포인트예요. 실제 포인트·아바타에는 반영되지 않으며
        새로고침하면 초기화돼요.
      </div>
      <header className="shop-heading">
        <div>
          <h1>
            뭐든상회<span aria-hidden="true">.</span>
          </h1>
          <p>작은 아이템으로, 조금 더 나다운 한 자리.</p>
        </div>
        <div className="shop-wallet" data-ph-private>
          <span className="shop-wallet__coin">
            <Coins size={24} />
          </span>
          <div>
            <span>체험 포인트</span>
            <strong aria-label={`체험 포인트 ${formatPoints(wallet.balance)}`}>
              {formatPoints(wallet.balance)}
            </strong>
          </div>
        </div>
      </header>
      <div className="shop-toolbar">
        <Link to="/my/avatar" data-ph-capture-attribute-action="shop_avatar_open">
          내 아바타 <ArrowRight size={15} />
        </Link>
      </div>
      <div className="shop-feedback" role="status">
        {message}
      </div>
      {equipment.isError && (
        <p className="shop-error" role="alert">
          착용을 변경하지 못했어요. 다시 시도해 주세요.
        </p>
      )}
      <div className="shop-workspace">
        <aside className="shop-sidebar">
          <p className="shop-sidebar__label">카테고리</p>
          <nav aria-label="상품 카테고리">
            {categories.map((item) => {
              const Icon = CATEGORY_ICONS[item.id] || Package;
              return (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={category === item.id}
                  data-ph-capture-attribute-action="shop_category_change"
                  onClick={() => {
                    setCategory(item.id);
                    setSelection(null);
                  }}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <small>
                    {
                      catalog.products.filter(
                        (product) => item.id === "all" || product.categoryId === item.id
                      ).length
                    }
                  </small>
                </button>
              );
            })}
          </nav>
          <div className="shop-sidebar__tip">
            <Sparkles size={20} />
            <strong>취향대로 골라보세요</strong>
            <p>상품을 고르면 구매 전에 미리 볼 수 있어요.</p>
          </div>
        </aside>
        <section className="shop-catalog" aria-label="상점 상품">
          <div className="shop-catalog__heading">
            <h2>
              {categories.find((item) => item.id === category)?.label}{" "}
              <span>{products.length}</span>
            </h2>
            <span>마음에 드는 아이템을 만나보세요</span>
          </div>
          {products.length ? (
            <div className="shop-product-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  selected={selected?.id === product.id}
                  owned={inventory.items.some((item) => item.itemId === product.grant.itemId)}
                  equipped={inventory.equipped[product.grant.slot] === product.grant.itemId}
                  onSelect={() => {
                    setSelection(product.id);
                    if (window.matchMedia("(max-width: 767px)").matches)
                      detailsRef.current?.focus({ preventScroll: false });
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="shop-empty">
              <Package size={40} />
              <p>표시할 상품이 없어요.</p>
            </div>
          )}
        </section>
        <div
          className="shop-detail-anchor"
          ref={detailsRef}
          tabIndex={-1}
          aria-label="상품 미리보기"
        >
          {selected ? (
            <ProductDetail
              product={selected}
              catalog={catalog}
              wallet={wallet}
              inventory={inventory}
              onBuy={openPurchase}
              onEquip={equip}
              pending={pending}
            />
          ) : null}
        </div>
      </div>
      <Modal
        open={Boolean(confirmation)}
        title="이 아이템을 구매할까요?"
        description="체험 포인트로 구매하며, 실제 포인트는 사용되지 않아요."
        closeAction="shop_purchase_dismiss"
        dismissible={!purchase.isPending}
        onClose={() => setConfirmation(null)}
        panelClassName="shop-purchase-dialog"
      >
        {purchaseProduct && (
          <>
            <div className="shop-purchase-item">
              <ProductArt {...purchaseProduct.preview} />
              <div>
                <strong>{purchaseProduct.name}</strong>
                <p>영구 보유 · 중복 구매 불가</p>
              </div>
            </div>
            <dl className="shop-purchase-summary">
              <div>
                <dt>사용 포인트</dt>
                <dd>{formatPoints(purchaseProduct.price)}</dd>
              </div>
              <div>
                <dt>구매 후 잔액</dt>
                <dd>{formatPoints(Math.max(0, wallet.balance - purchaseProduct.price))}</dd>
              </div>
            </dl>
            {purchase.isError && (
              <p className="shop-error" role="alert">
                {SHOP_ERROR_MESSAGES[purchase.error?.code] ||
                  "구매 결과를 확인하지 못했어요. 다시 누르면 같은 요청의 결과를 확인해요."}
              </p>
            )}
            <div className="shop-dialog-actions">
              <Button
                variant="secondary"
                data-ph-capture-attribute-action="shop_purchase_cancel"
                disabled={purchase.isPending}
                onClick={() => setConfirmation(null)}
              >
                돌아가기
              </Button>
              <Button
                data-ph-capture-attribute-action="shop_purchase_confirm"
                pending={purchase.isPending}
                disabled={definitiveError}
                onClick={confirmPurchase}
              >
                {purchase.isError && !definitiveError
                  ? "구매 결과 다시 확인"
                  : `${formatPoints(purchaseProduct.price)} 구매 확정`}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

function DemoShopSession() {
  const [client] = useState(() => createDemoShopClient());
  return <ShopPreview client={client} />;
}

export function ShopPage() {
  const { member, sessionVersion } = useAuth();
  return <DemoShopSession key={`${member?.id || "guest"}:${sessionVersion}`} />;
}
