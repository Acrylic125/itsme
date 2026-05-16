export {
  CLIENT_ID_PREFIX,
  isClientId,
  newClientBlockId,
} from "./client-ids";

export {
  type BlockDocument,
  type ParentRef,
  buildBlockByIdMap,
  collectSubtreeBlockIds,
  collectSubtreeBlocksInDocumentOrder,
  collectSubtreeIdsInto,
  findParentRef,
  getChildBlockIds,
  getNestedChildIdSet,
  getParentBlockId,
  getStructuralRootBlocks,
  isDescendantOf,
  isNestedInsideBlock,
  pruneStaleLayoutReferences,
  sanitizeRootLayout,
} from "./graph";

export {
  type ConvexBlockRowData,
  clientBlockToConvexData,
  convexDataToClientBlock,
  remapConvexBlockRowData,
} from "./persistence/convex-codec";

export {
  type ClientIdMappings,
  type Document,
  type DocumentBlocksSnapshot,
  createEmptyClientIdMappings,
  documentBlocksSnapshotToDocument,
  mapBlockIdForMutation,
  mergeClientIdMappingRecord,
  remapSnapshotIds,
  snapshotConvexToClient,
} from "./persistence/snapshot";

export {
  type DocumentStore,
  type DocumentStoreAction,
  type DocumentStoreAddBlockAction,
  type DocumentStoreEditBlockAction,
  type DocumentStoreFocusBlockAction,
  type DocumentStoreMoveBlockAction,
  type DocumentStorePasteBlockAction,
  type DocumentStoreResizeColumnAction,
  type DocumentStoreState,
  asAddBlockAction,
  asEditBlockAction,
  asFocusBlockAction,
  asMoveBlockAction,
  asPasteBlockAction,
  asResizeColumnAction,
  createDocumentStore,
  selectActiveBlockId,
  selectAddBlockAction,
  selectEditBlockAction,
  selectFocusBlockId,
  selectMoveBlockAction,
  selectPasteBlockAction,
  selectResizeColumnAction,
} from "./document-store";
