/* eslint-disable */
// @ts-nocheck
// Manually updated for Project Lab routes

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as ShopRouteImport } from './routes/shop'
import { Route as DropsRouteImport } from './routes/drops'
import { Route as AboutRouteImport } from './routes/about'
import { Route as CollectionsRouteImport } from './routes/collections'
import { Route as AdminRouteImport } from './routes/admin'
import { Route as CheckoutRouteImport } from './routes/checkout'
import { Route as CheckoutSuccessRouteImport } from './routes/checkout/success'
import { Route as ReturnsRouteImport } from './routes/returns'
import { Route as ReceiptRouteImport } from './routes/receipt'
import { Route as ProductSlugRouteImport } from './routes/product/$slug'
import { Route as ApiStripeWebhookRouteImport } from './routes/api/stripe-webhook'
import { Route as ApiAdminLoginRouteImport } from './routes/api/admin-login'
import { Route as ApiAdminLogoutRouteImport } from './routes/api/admin-logout'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

const ShopRoute = ShopRouteImport.update({
  id: '/shop',
  path: '/shop',
  getParentRoute: () => rootRouteImport,
} as any)

const DropsRoute = DropsRouteImport.update({
  id: '/drops',
  path: '/drops',
  getParentRoute: () => rootRouteImport,
} as any)

const AboutRoute = AboutRouteImport.update({
  id: '/about',
  path: '/about',
  getParentRoute: () => rootRouteImport,
} as any)

const CollectionsRoute = CollectionsRouteImport.update({
  id: '/collections',
  path: '/collections',
  getParentRoute: () => rootRouteImport,
} as any)

const CheckoutSuccessRoute = CheckoutSuccessRouteImport.update({
  id: '/checkout/success',
  path: '/checkout/success',
  getParentRoute: () => rootRouteImport,
} as any)


const ReturnsRoute = ReturnsRouteImport.update({
  id: '/returns',
  path: '/returns',
  getParentRoute: () => rootRouteImport,
} as any)
const ReceiptRoute = ReceiptRouteImport.update({
  id: '/receipt',
  path: '/receipt',
  getParentRoute: () => rootRouteImport,
} as any)

const CheckoutRoute = CheckoutRouteImport.update({
  id: '/checkout',
  path: '/checkout',
  getParentRoute: () => rootRouteImport,
} as any)

const AdminRoute = AdminRouteImport.update({
  id: '/admin',
  path: '/admin',
  getParentRoute: () => rootRouteImport,
} as any)

const ApiAdminLoginRoute = ApiAdminLoginRouteImport.update({
  id: '/api/admin-login',
  path: '/api/admin-login',
  getParentRoute: () => rootRouteImport,
} as any)
const ApiAdminLogoutRoute = ApiAdminLogoutRouteImport.update({
  id: '/api/admin-logout',
  path: '/api/admin-logout',
  getParentRoute: () => rootRouteImport,
} as any)
const ApiStripeWebhookRoute = ApiStripeWebhookRouteImport.update({
  id: '/api/stripe-webhook',
  path: '/api/stripe-webhook',
  getParentRoute: () => rootRouteImport,
} as any)

const ProductSlugRoute = ProductSlugRouteImport.update({
  id: '/product/$slug',
  path: '/product/$slug',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/shop': typeof ShopRoute
  '/drops': typeof DropsRoute
  '/about': typeof AboutRoute
  '/collections': typeof CollectionsRoute
  '/admin': typeof AdminRoute
  '/checkout': typeof CheckoutRoute
  '/checkout/success': typeof CheckoutSuccessRoute
  '/returns': typeof ReturnsRoute
  '/receipt': typeof ReceiptRoute
  '/product/$slug': typeof ProductSlugRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/shop': typeof ShopRoute
  '/drops': typeof DropsRoute
  '/about': typeof AboutRoute
  '/collections': typeof CollectionsRoute
  '/admin': typeof AdminRoute
  '/checkout': typeof CheckoutRoute
  '/checkout/success': typeof CheckoutSuccessRoute
  '/returns': typeof ReturnsRoute
  '/receipt': typeof ReceiptRoute
  '/product/$slug': typeof ProductSlugRoute
}

export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/shop': typeof ShopRoute
  '/drops': typeof DropsRoute
  '/about': typeof AboutRoute
  '/collections': typeof CollectionsRoute
  '/admin': typeof AdminRoute
  '/checkout': typeof CheckoutRoute
  '/checkout/success': typeof CheckoutSuccessRoute
  '/returns': typeof ReturnsRoute
  '/receipt': typeof ReceiptRoute
  '/product/$slug': typeof ProductSlugRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/shop' | '/drops' | '/about' | '/collections' | '/admin' | '/checkout' | '/checkout/success' | '/returns' | '/receipt' | '/product/$slug'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/shop' | '/drops' | '/about' | '/collections' | '/admin' | '/checkout' | '/checkout/success' | '/returns' | '/receipt' | '/product/$slug'
  id: '__root__' | '/' | '/shop' | '/drops' | '/about' | '/collections' | '/admin' | '/checkout' | '/checkout/success' | '/returns' | '/receipt' | '/product/$slug'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  ShopRoute: typeof ShopRoute
  DropsRoute: typeof DropsRoute
  AboutRoute: typeof AboutRoute
  CollectionsRoute: typeof CollectionsRoute
  AdminRoute: typeof AdminRoute
  CheckoutRoute: typeof CheckoutRoute
  CheckoutSuccessRoute: typeof CheckoutSuccessRoute
  ReturnsRoute: typeof ReturnsRoute
  ReceiptRoute: typeof ReceiptRoute
  ProductSlugRoute: typeof ProductSlugRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  ShopRoute: ShopRoute,
  DropsRoute: DropsRoute,
  AboutRoute: AboutRoute,
  CollectionsRoute: CollectionsRoute,
  AdminRoute: AdminRoute,
  CheckoutRoute: CheckoutRoute,
  CheckoutSuccessRoute: CheckoutSuccessRoute,
  ReturnsRoute: ReturnsRoute,
  ReceiptRoute: ReceiptRoute,
  ProductSlugRoute: ProductSlugRoute,
}

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
