use crate::assets::constants::CDN_JUNO_RELEASES_COLLECTION_KEY;
use candid::Principal;
use junobuild_collections::assert::stores::{
    assert_create_permission, assert_create_permission_with, assert_permission,
    assert_permission_with,
};
use junobuild_collections::constants::assets::COLLECTION_ASSET_KEY;
use junobuild_collections::types::core::CollectionKey;
use junobuild_collections::types::rules::Permission;
use junobuild_shared::controllers::{controller_can_write, is_controller};
use junobuild_shared::types::state::Controllers;

pub fn assert_cdn_write_on_dapp_collection(caller: Principal, controllers: &Controllers) -> bool {
    // When using proposals, we allow any controllers to upload - submit - an asset to be served from #dapp collection
    is_controller(caller, controllers)
}

pub fn assert_cdn_write_on_system_collection(
    caller: Principal,
    collection: &CollectionKey,
    controllers: &Controllers,
) -> bool {
    // Only controllers with scope "Admin" or "Write" can write in reserved collections starting with #
    // ...unless the collection is #_juno and the controller is "Submit".
    if collection == CDN_JUNO_RELEASES_COLLECTION_KEY {
        return is_controller(caller, controllers);
    }

    controller_can_write(caller, controllers)
}

pub fn assert_cdn_create_permission(
    permission: &Permission,
    caller: Principal,
    collection: &CollectionKey,
    controllers: &Controllers,
) -> bool {
    // Through a proposal, any controller - including "Submit" - can provide an asset for the #_juno or #dapp collections.
    if collection == CDN_JUNO_RELEASES_COLLECTION_KEY || collection == COLLECTION_ASSET_KEY {
        return assert_create_permission_with(permission, caller, controllers, is_controller);
    }

    assert_create_permission(permission, caller, controllers)
}

pub fn assert_cdn_update_permission(
    permission: &Permission,
    owner: Principal,
    caller: Principal,
    collection: &CollectionKey,
    controllers: &Controllers,
) -> bool {
    // Through a proposal, any controller - including "Submit" - can provide an update of an asset for the #_juno or #dapp collections.
    if collection == CDN_JUNO_RELEASES_COLLECTION_KEY || collection == COLLECTION_ASSET_KEY {
        return assert_permission_with(permission, owner, caller, controllers, is_controller);
    }

    assert_permission(permission, owner, caller, controllers)
}
