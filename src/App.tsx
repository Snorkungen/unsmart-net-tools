import { Component, For } from 'solid-js';
import ViewRouter, { createViewHref } from './components/view-router';
import { views } from './view-manifest';

const App: Component = () => {
  return (
    <>
      <nav data-bs-theme="dark" class="navbar navbar-expand-md bg-body-tertiary">
        <div class="container-fluid">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <For each={views}>{([component, name], i) => (
              <li class="nav-item">
                <a class="nav-link" href={createViewHref(component.name + i())}>{name}</a>
              </li>
            )}</For>
          </ul>
        </div>
      </nav>
      <div class="container">
        <div data-bs-theme="dark" class="card">
          <div class="card-body">

            <ViewRouter views={views.map(([Comp], i) => ({
              element: <Comp />,
              name: Comp.name + i
            }))}
              fallback={(
                <h1>View not found</h1>
              )}
            />

          </div>
        </div>
      </div>
    </>
  );
};

export default App;
