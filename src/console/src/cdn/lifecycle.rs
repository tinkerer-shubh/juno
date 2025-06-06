use crate::cdn::constants::DEFAULT_RELEASES_COLLECTIONS;
use junobuild_collections::constants::assets::DEFAULT_ASSETS_COLLECTIONS;
use junobuild_storage::types::state::StorageHeapState;

pub fn init_cdn_storage_heap_state() -> StorageHeapState {
    let mut collections = Vec::with_capacity(2);
    collections.extend_from_slice(&DEFAULT_ASSETS_COLLECTIONS);
    collections.extend_from_slice(&DEFAULT_RELEASES_COLLECTIONS);

    StorageHeapState::new_with_storage_collections(collections)
}
