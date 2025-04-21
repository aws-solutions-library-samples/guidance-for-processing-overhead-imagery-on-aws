"use client";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";

interface DeleteViewpointModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleteAction: () => void;
}

export const DeleteViewpointModal = ({
  isOpen,
  onOpenChange,
  onDeleteAction,
}: DeleteViewpointModalProps) => {
  return (
    <Modal isOpen={isOpen} size="sm" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Confirm Delete</ModalHeader>
            <ModalBody>
              Are you sure you want to delete this viewpoint?
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button color="danger" onPress={onDeleteAction}>
                Delete
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};
