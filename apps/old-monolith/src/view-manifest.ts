import CalculatorSubnetIPV4 from "./views/calculator-subnet";
import NetworkMap from "./views/network-map";
import PacketCaptureViewer from "./views/packet-capture";
import { TestingComponent } from "./views/testing-component";
import { Component } from "solid-js";

export const views: [Component, string][] = [
    [NetworkMap, "Network Map"],
    [CalculatorSubnetIPV4, "Subnet Calculator"],
    [TestingComponent, "Testing Component"],
    [PacketCaptureViewer, "Packet Capture Viewer"]
];