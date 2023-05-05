import { Component, JSX, Show } from "solid-js"
import { createStore } from "solid-js/store";

const VIEW_ROUTER_SEARCH_NAME = encodeURIComponent("VR:NAME")

type View = {
    element: JSX.Element;
    name: string;
}

export type ViewRouterProps = {
    children?: JSX.Element;
    views: Array<Partial<View> & { element: View["element"] }>;
    fallback?: JSX.Element;
}

let viewRouterIsInitialized = false;
let viewOptions: Array<View & { name: string }> = [];

const [viewStore, setViewStore] = createStore<Partial<View & { data: unknown }>>();

const getHashData = () => {
    let hash = location.hash.substring(1);

    if (hash.slice(0, VIEW_ROUTER_SEARCH_NAME.length) != VIEW_ROUTER_SEARCH_NAME) {
        return null;
    }

    if (!viewOptions.length) {
        return null;
    }

    let [, value] = hash.split("=")

    if (!value) {
        return null
    }

    let [name, data] = value.split(",");

    return {
        name: decodeURIComponent(name),
        data: decodeURIComponent(data)
    }
}

const handleSetView = () => {
    let hashData = getHashData();
    if (!hashData) {
        return;
    }

    let { name } = hashData;
    let view = viewOptions.find((view) => view.name == name);

    setViewStore(view || {});
}

window.addEventListener("hashchange", handleSetView)

function setViewHash(name: string, data?: string) {
    location.hash = createViewHref(name, data)
}

const ViewRouter: Component<ViewRouterProps> = ({ children, views, fallback }) => {
    if (viewRouterIsInitialized) {
        throw new Error("view router is already in use")
    } else {
        viewRouterIsInitialized = true;
    }

    if (views.length < 1) {
        throw new Error("at least one view must be defined")
    }

    // ensure that every view has a name
    viewOptions = views.map((view, i) => {
        if (!view.name) view.name = i.toString(16);
        return view as View;
    });

    if (!getHashData()) {
        setViewHash(views[0].name!)
    }

    handleSetView();

    return <>
        <Show when={viewStore.element} fallback={fallback} >
            {viewStore.element}
        </Show>
        {children}
    </>
}

export function createViewHref(name: string | number, data?: string) {
    if (typeof name == "number") {
        let view = viewOptions[name];
        if (view) name = view.name
        else name = name.toString(16)
    }
    return `#${VIEW_ROUTER_SEARCH_NAME}=${encodeURIComponent(name)},${encodeURIComponent(data || "")}`
};

export default ViewRouter;