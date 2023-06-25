import { Container, Nav, Navbar, Card, NavLink } from 'solid-bootstrap';
import type { Component } from 'solid-js';
import ViewRouter, { createViewHref } from './components/view-router';
import { TestingComponent } from './components/testing-component';
import PacketCapture from './components/packet-capture';
import CalculatorSubnetIPV4 from './components/calculator-subnet';

const App: Component = () => {
  return (
    <div>
      <Navbar bg="dark" variant="dark">
        <Container>
          <Navbar.Brand href="#home">Navbar</Navbar.Brand>
          <Nav class="me-auto">
            <NavLink href={createViewHref(CalculatorSubnetIPV4.name)}>Subnet calculator v4 NEW!</NavLink>
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
                  <CalculatorSubnetIPV4 />
                ),
                name: CalculatorSubnetIPV4.name
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
