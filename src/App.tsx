import { Container, Nav, Navbar, Card, NavLink } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import CalculatorSubnetV4 from './components/calculator-subnet';
import ViewRouter, { createViewHref } from './components/view-router';
import { TestingComponent } from './components/testing-component';
import PacketCapture from './components/packet-capture';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">
            <NavLink href={createViewHref(CalculatorSubnetV4.name)}>Subnet calculator v4</NavLink>
            <NavLink href={createViewHref(TestingComponent.name)}>Testing</NavLink>
            <NavLink href={createViewHref(PacketCapture.name)}>Testing</NavLink>
          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Card bg='dark' text='light' class='mt-4'>
          <Card.Body>
            <ViewRouter views={[
              {
                element: (

                  <PacketCapture />
                ),
                name: PacketCapture.name
              },
              {
                element: (

                  <TestingComponent />
                ),
                name: TestingComponent.name
              },
              {
                element: (
                  <CalculatorSubnetV4 />
                ),
                name: CalculatorSubnetV4.name
              }
            ]}
              fallback={(
                <h1>View not found</h1>
              )}
            />
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
};

export default App;
